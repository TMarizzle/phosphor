from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path


@dataclass
class Passage:
    name: str
    tags: str
    text: str


class StoryParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_passage = False
        self._current_name = ""
        self._current_tags = ""
        self._current_chunks: list[str] = []
        self.passages: list[Passage] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "tw-passagedata":
            return

        attrs_dict = dict(attrs)
        self._in_passage = True
        self._current_name = attrs_dict.get("name") or ""
        self._current_tags = attrs_dict.get("tags") or ""
        self._current_chunks = []

    def handle_endtag(self, tag: str) -> None:
        if tag != "tw-passagedata" or not self._in_passage:
            return

        self.passages.append(
            Passage(
                name=self._current_name,
                tags=self._current_tags,
                text="".join(self._current_chunks),
            )
        )
        self._in_passage = False
        self._current_name = ""
        self._current_tags = ""
        self._current_chunks = []

    def handle_data(self, data: str) -> None:
        if self._in_passage:
            self._current_chunks.append(data)


def load_passages(html_path: Path) -> list[Passage]:
    parser = StoryParser()
    parser.feed(html_path.read_text(encoding="utf-8"))
    return parser.passages


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("html_path", type=Path)
    parser.add_argument("--contains", type=str, default="")
    parser.add_argument("--show", type=int, default=40)
    parser.add_argument("--preview", type=int, default=280)
    parser.add_argument("--names-only", action="store_true")
    args = parser.parse_args()

    passages = load_passages(args.html_path)
    needle = args.contains.lower().strip()
    if needle:
        passages = [
            passage
            for passage in passages
            if needle in passage.name.lower() or needle in passage.text.lower()
        ]

    for index, passage in enumerate(passages[: args.show], start=1):
        if args.names_only:
            print(passage.name)
            continue

        preview = passage.text.replace("\r", "").replace("\n", "\\n")
        if len(preview) > args.preview:
            preview = preview[: args.preview] + "..."
        safe_name = passage.name.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8")
        safe_preview = preview.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8")
        print(f"{index:03d}. {safe_name} | tags={passage.tags or '-'}")
        print(f"     {safe_preview}")

    print(f"\nTotal passages: {len(passages)}")


if __name__ == "__main__":
    main()
