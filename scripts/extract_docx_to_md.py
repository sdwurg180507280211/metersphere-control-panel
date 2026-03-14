#!/usr/bin/env python3

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def qname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def paragraph_text(paragraph: ET.Element) -> str:
    parts: list[str] = []
    for node in paragraph.iter():
        tag = qname(node.tag)
        if tag == "t":
            parts.append(node.text or "")
        elif tag == "tab":
            parts.append("\t")
        elif tag in {"br", "cr"}:
            parts.append("\n")
    return "".join(parts).strip()


def table_lines(table: ET.Element) -> list[str]:
    lines: list[str] = []
    for row in table.findall("./w:tr", NS):
        cells: list[str] = []
        for cell in row.findall("./w:tc", NS):
            paragraphs = [paragraph_text(p) for p in cell.findall("./w:p", NS)]
            cell_text = " ".join(text for text in paragraphs if text).strip()
            cells.append(cell_text)
        if any(cells):
            lines.append(" | ".join(cells).strip())
    return lines


def extract_docx_text(docx_path: Path) -> str:
    with ZipFile(docx_path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))

    body = root.find("w:body", NS)
    if body is None:
        return ""

    blocks: list[str] = []
    for child in list(body):
        tag = qname(child.tag)
        if tag == "p":
            text = paragraph_text(child)
            if text:
                blocks.append(text)
        elif tag == "tbl":
            blocks.extend(line for line in table_lines(child) if line)

    if not blocks:
        return ""

    return "\n\n".join(blocks).rstrip() + "\n"


def convert_directory(base_dir: Path) -> int:
    processed = 0
    for docx_path in sorted(base_dir.glob("*.docx")):
        md_path = docx_path.with_suffix(".md")
        md_path.write_text("", encoding="utf-8")
        md_path.write_text(extract_docx_text(docx_path), encoding="utf-8")
        print(f"{docx_path.name} -> {md_path.name}")
        processed += 1
    return processed


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: extract_docx_to_md.py <directory>", file=sys.stderr)
        return 1

    base_dir = Path(sys.argv[1]).expanduser()
    if not base_dir.is_dir():
        print(f"Directory not found: {base_dir}", file=sys.stderr)
        return 1

    processed = convert_directory(base_dir)
    print(f"TOTAL {processed} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
