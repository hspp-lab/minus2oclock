#!/bin/bash
# =============================================================================
# img/<子フォルダ>/ 直下の画像を 001.jpg 形式に揃えたあと、
# ov（一覧）と vw（単体・背景）を作り直し、縮小版のカメラ情報を消す。
# 原寸の中身はリネーム以外さわらない。ov / vw は毎回差し替える。
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
IMG_ROOT="$ROOT/img"
OV_MAX=800
VW_MAX=1600
OV_QUALITY=70
VW_QUALITY=76

cd "$ROOT"

if [[ ! -d "$IMG_ROOT" ]]; then
  echo "img フォルダが見つかりません: $IMG_ROOT"
  read -r -p "Enter で閉じる..." _
  exit 1
fi

is_jpeg() {
  local f="$1"
  case "$(printf '%s' "$f" | tr 'A-Z' 'a-z')" in
    *.jpg|*.jpeg) return 0 ;;
    *) return 1 ;;
  esac
}

strip_camera_info() {
  local file="$1"
  if command -v exiftool >/dev/null 2>&1; then
    exiftool -overwrite_original -all= -tagsFromFile @ -icc_profile "$file" >/dev/null
    return
  fi
  python3 - "$file" <<'PY'
import struct
import sys

path = sys.argv[1]
with open(path, "rb") as f:
    data = f.read()
if len(data) < 4 or data[:2] != b"\xff\xd8":
    raise SystemExit(0)

out = bytearray(b"\xff\xd8")
i = 2
n = len(data)
while i + 1 < n:
    if data[i] != 0xFF:
        out.extend(data[i:])
        break
    marker = data[i + 1]
    if marker == 0xDA:
        out.extend(data[i:])
        break
    if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
        out.extend(data[i:i + 2])
        i += 2
        continue
    if i + 3 >= n:
        out.extend(data[i:])
        break
    seglen = struct.unpack(">H", data[i + 2:i + 4])[0]
    end = i + 2 + seglen
    seg = data[i:end]
    # Exif / XMP / IPTC / コメントを削除。ICC (APP2) は色のため残す
    if marker in (0xE1, 0xED, 0xFE):
        i = end
        continue
    out.extend(seg)
    i = end

with open(path, "wb") as f:
    f.write(out)
PY
}

pad_width() {
  local n="$1"
  local w="${#n}"
  if [[ "$w" -lt 3 ]]; then
    echo 3
  else
    echo "$w"
  fi
}

echo "作業フォルダ: $ROOT"
echo "1) 子フォルダ直下の JPEG を 001.jpg 形式にリネーム（拡張子は jpg）"
echo "2) 元画像のカメラ情報を削除してからリネーム"
echo "3) ov / vw を空にして作り直し（長辺 ${OV_MAX} / ${VW_MAX}）"
echo "4) ov / vw のカメラ情報も削除"
echo

total_src=0
total_web=0

shopt -s nullglob
for gallery in "$IMG_ROOT"/*/; do
  name="$(basename "$gallery")"
  gallery="${gallery%/}"

  sources=()
  for f in "$gallery"/*; do
    [[ -f "$f" ]] || continue
    is_jpeg "$f" || continue
    sources+=("$f")
  done

  if [[ ${#sources[@]} -eq 0 ]]; then
    echo "--- $name : 直下に JPEG がないのでスキップ ---"
    echo
    continue
  fi

  IFS=$'\n' sources=($(printf '%s\n' "${sources[@]}" | LC_ALL=C sort))
  unset IFS

  n="${#sources[@]}"
  width="$(pad_width "$n")"
  echo "--- $name : ${n} 枚を ${width} 桁の連番にリネーム ---"

  # 衝突避け：いったん仮名へ
  i=0
  for src in "${sources[@]}"; do
    i=$((i + 1))
    strip_camera_info "$src"
    tmp="$gallery/.rename_tmp_$(printf "%0${width}d" "$i").jpg"
    mv -f "$src" "$tmp"
  done

  i=0
  for tmp in "$gallery"/.rename_tmp_*.jpg; do
    i=$((i + 1))
    dest="$gallery/$(printf "%0${width}d" "$i").jpg"
    mv -f "$tmp" "$dest"
    echo "  $(basename "$dest")"
    total_src=$((total_src + 1))
  done

  echo "  ov / vw を刷新"
  rm -rf "$gallery/ov" "$gallery/vw"
  mkdir -p "$gallery/ov" "$gallery/vw"

  for src in "$gallery"/*.jpg; do
    [[ -f "$src" ]] || continue
    base="$(basename "$src")"
    sips -Z "$OV_MAX" -s format jpeg -s formatOptions "$OV_QUALITY" "$src" --out "$gallery/ov/$base" >/dev/null
    sips -Z "$VW_MAX" -s format jpeg -s formatOptions "$VW_QUALITY" "$src" --out "$gallery/vw/$base" >/dev/null
    strip_camera_info "$gallery/ov/$base"
    strip_camera_info "$gallery/vw/$base"
    total_web=$((total_web + 2))
  done
  echo
done
shopt -u nullglob

echo "原寸 ${total_src} 枚 / 縮小 ${total_web} ファイル"
if command -v exiftool >/dev/null 2>&1; then
  echo "カメラ情報削除: exiftool（ICC プロファイルは色のため残しています）"
else
  echo "カメラ情報削除: Python（Exif / XMP / IPTC）。brew install exiftool でより確実"
fi
echo "完了しました。"
echo
read -r -p "Enter で閉じる..." _
