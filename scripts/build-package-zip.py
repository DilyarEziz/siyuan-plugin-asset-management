"""Build and fully verify the release package.zip whitelist.

The archive is written to a temporary path, reopened, and checked before it
atomically replaces package.zip. A failed assertion therefore leaves the last
valid release package untouched.
"""

import json
import os
import re
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
ZIP_PATH = os.path.join(ROOT, "package.zip")
EXPECTED_PNG_COUNT = 33
EXPECTED_ENTRY_COUNT = 44
ICON_MAX_BYTES = 20 * 1024
PREVIEW_MAX_BYTES = 200 * 1024

ROOT_FILES = [
    "index.js", "kernel.js", "index.css", "plugin.json", "icon.png", "preview.png",
    "README.md", "README_zh_CN.md",
    "i18n/zh_CN.json", "i18n/en_US.json",
]

PRESET_ICONS_DIR = os.path.join(ROOT, "assets", "preset-icons")
MANIFEST_ENTRY = "assets/preset-icons/manifest.json"


def plugin_version(path):
    with open(path, "r", encoding="utf-8") as f:
        version = json.load(f)["version"]
    if not isinstance(version, str) or not version.strip():
        raise RuntimeError(f"invalid plugin version in {path}")
    return version.strip()


def read_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def plugin_version_constant(content, label):
    m = re.search(r"\bconst\s+PLUGIN_VERSION\s*=\s*(['\"])([^'\"]+)\1", content)
    if not m:
        raise RuntimeError(f"PLUGIN_VERSION constant not found in {label}")
    return m.group(2)


def first_changelog_version(content, label):
    heading = re.search(r"^##\s+(?:Changelog|更新日志)\s*$", content, re.MULTILINE)
    if not heading:
        raise RuntimeError(f"changelog heading not found in {label}")
    release = re.search(r"^###\s+v([^\s]+)\s*$", content[heading.end():], re.MULTILINE)
    if not release:
        raise RuntimeError(f"first changelog version not found in {label}")
    return release.group(1)


def manifest_filenames(manifest, label):
    icons = manifest.get("icons") if isinstance(manifest, dict) else None
    if not isinstance(icons, list):
        raise RuntimeError(f"{label} icons must be an array")
    filenames = []
    for index, icon in enumerate(icons):
        filename = icon.get("filename") if isinstance(icon, dict) else None
        if (not isinstance(filename, str) or not filename
                or filename != os.path.basename(filename)
                or not filename.lower().endswith(".png")):
            raise RuntimeError(f"{label} icons[{index}].filename is invalid")
        filenames.append(filename)
    if len(filenames) != len(set(filenames)):
        raise RuntimeError(f"{label} contains duplicate filenames")
    return filenames


def preset_icon_pngs():
    if not os.path.isdir(PRESET_ICONS_DIR):
        raise RuntimeError(f"preset icon directory missing: {PRESET_ICONS_DIR}")
    return sorted(
        name for name in os.listdir(PRESET_ICONS_DIR)
        if name.lower().endswith(".png")
    )


def build_whitelist(icon_pngs):
    assets = ["assets/preset-icons/" + name for name in icon_pngs]
    return ROOT_FILES + assets + [MANIFEST_ENTRY]


def assert_source_release(version, icon_pngs, whitelist):
    if len(icon_pngs) != EXPECTED_PNG_COUNT:
        raise RuntimeError(
            f"preset PNG count={len(icon_pngs)} != {EXPECTED_PNG_COUNT}"
        )
    if len(whitelist) != EXPECTED_ENTRY_COUNT:
        raise RuntimeError(
            f"whitelist entries={len(whitelist)} != {EXPECTED_ENTRY_COUNT}"
        )
    for rel in whitelist:
        abs_path = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.isfile(abs_path):
            raise RuntimeError(f"whitelist entry missing: {rel}")

    source_constant = plugin_version_constant(
        read_text(os.path.join(ROOT, "src.template.js")), "src.template.js"
    )
    if source_constant != version:
        raise RuntimeError(
            f"plugin.json.version={version!r} != PLUGIN_VERSION={source_constant!r}"
        )

    index_constant = plugin_version_constant(
        read_text(os.path.join(ROOT, "index.js")), "index.js"
    )
    if index_constant != version:
        raise RuntimeError(
            f"index.js PLUGIN_VERSION={index_constant!r} != source {version!r}; "
            "run node scripts/concat.js"
        )

    for readme in ("README.md", "README_zh_CN.md"):
        release = first_changelog_version(
            read_text(os.path.join(ROOT, readme)), readme
        )
        if release != version:
            raise RuntimeError(
                f"{readme} first changelog version={release!r} != source {version!r}"
            )

    icon_size = os.path.getsize(os.path.join(ROOT, "icon.png"))
    preview_size = os.path.getsize(os.path.join(ROOT, "preview.png"))
    if icon_size > ICON_MAX_BYTES:
        raise RuntimeError(f"icon.png size={icon_size} exceeds {ICON_MAX_BYTES} bytes")
    if preview_size > PREVIEW_MAX_BYTES:
        raise RuntimeError(
            f"preview.png size={preview_size} exceeds {PREVIEW_MAX_BYTES} bytes"
        )

    manifest = json.loads(read_text(os.path.join(PRESET_ICONS_DIR, "manifest.json")))
    filenames = manifest_filenames(manifest, "source manifest.json")
    if set(filenames) != set(icon_pngs):
        raise RuntimeError(
            "source manifest PNG mapping mismatch: "
            f"unmapped files={sorted(set(icon_pngs) - set(filenames))}, "
            f"missing files={sorted(set(filenames) - set(icon_pngs))}"
        )


def verify_archive(path, whitelist, version):
    with zipfile.ZipFile(path, "r") as zf:
        bad_entry = zf.testzip()
        if bad_entry:
            raise RuntimeError(f"zip CRC check failed: {bad_entry}")

        names = zf.namelist()
        if len(names) != EXPECTED_ENTRY_COUNT:
            raise RuntimeError(
                f"zip entries={len(names)} != {EXPECTED_ENTRY_COUNT}"
            )
        if len(names) != len(set(names)):
            raise RuntimeError("zip contains duplicate entries")
        if "kernel.js" not in names:
            raise RuntimeError("zip is missing kernel.js; Agent/MCP capabilities would be unavailable")
        if set(names) != set(whitelist):
            raise RuntimeError(
                "zip contents mismatch whitelist; "
                f"extra={sorted(set(names) - set(whitelist))}, "
                f"missing={sorted(set(whitelist) - set(names))}"
            )

        zipped_version = json.loads(zf.read("plugin.json").decode("utf-8"))["version"]
        if zipped_version != version:
            raise RuntimeError(
                f"zip plugin.json version={zipped_version!r} != source {version!r}"
            )

        index_constant = plugin_version_constant(
            zf.read("index.js").decode("utf-8"), "zip index.js"
        )
        if index_constant != version:
            raise RuntimeError(
                f"zip index.js PLUGIN_VERSION={index_constant!r} != source {version!r}"
            )

        readme_versions = {}
        for readme in ("README.md", "README_zh_CN.md"):
            release = first_changelog_version(
                zf.read(readme).decode("utf-8"), f"zip {readme}"
            )
            if release != version:
                raise RuntimeError(
                    f"zip {readme} first changelog version={release!r} "
                    f"!= source {version!r}"
                )
            readme_versions[readme] = release

        icon_size = zf.getinfo("icon.png").file_size
        preview_size = zf.getinfo("preview.png").file_size
        if icon_size > ICON_MAX_BYTES:
            raise RuntimeError(f"zip icon.png size={icon_size} exceeds {ICON_MAX_BYTES} bytes")
        if preview_size > PREVIEW_MAX_BYTES:
            raise RuntimeError(
                f"zip preview.png size={preview_size} exceeds {PREVIEW_MAX_BYTES} bytes"
            )

        zip_pngs = sorted(
            name.rsplit("/", 1)[-1]
            for name in names
            if name.startswith("assets/preset-icons/") and name.lower().endswith(".png")
        )
        if len(zip_pngs) != EXPECTED_PNG_COUNT:
            raise RuntimeError(
                f"zip preset PNG count={len(zip_pngs)} != {EXPECTED_PNG_COUNT}"
            )
        manifest = json.loads(zf.read(MANIFEST_ENTRY).decode("utf-8"))
        manifest_pngs = manifest_filenames(manifest, "zip manifest.json")
        if set(manifest_pngs) != set(zip_pngs):
            raise RuntimeError(
                "zip manifest PNG mapping mismatch: "
                f"unmapped files={sorted(set(zip_pngs) - set(manifest_pngs))}, "
                f"missing files={sorted(set(manifest_pngs) - set(zip_pngs))}"
            )

    return {
        "entries": len(names),
        "preset_pngs": len(zip_pngs),
        "plugin_version": zipped_version,
        "index_version": index_constant,
        "readme_versions": readme_versions,
        "icon_size": icon_size,
        "preview_size": preview_size,
        "manifest_mappings": len(manifest_pngs),
    }


def main():
    tmp_path = ZIP_PATH + ".tmp"
    try:
        src_version = plugin_version(os.path.join(ROOT, "plugin.json"))
        icon_pngs = preset_icon_pngs()
        whitelist = build_whitelist(icon_pngs)
        assert_source_release(src_version, icon_pngs, whitelist)
        print(f"[pkg] source version: {src_version}")

        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for rel in whitelist:
                abs_path = os.path.join(ROOT, rel.replace("/", os.sep))
                zf.write(abs_path, rel)

        result = verify_archive(tmp_path, whitelist, src_version)
        os.replace(tmp_path, ZIP_PATH)
    except Exception as error:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        sys.exit(f"ABORT: {error}")

    print(f"[pkg] wrote {ZIP_PATH}")
    print(
        f"[pkg] verified entries: {result['entries']} "
        f"({result['preset_pngs']} preset PNGs + manifest)"
    )
    print(f"[pkg] verified zip plugin.json version: {result['plugin_version']}")
    print(f"[pkg] verified zip index.js PLUGIN_VERSION: {result['index_version']}")
    print(
        "[pkg] verified README first versions: "
        f"README.md={result['readme_versions']['README.md']}, "
        f"README_zh_CN.md={result['readme_versions']['README_zh_CN.md']}"
    )
    print(
        f"[pkg] verified media sizes: icon.png={result['icon_size']} bytes, "
        f"preview.png={result['preview_size']} bytes"
    )
    print(f"[pkg] verified manifest mappings: {result['manifest_mappings']}/33")
    print("[pkg] OK")


if __name__ == "__main__":
    main()
