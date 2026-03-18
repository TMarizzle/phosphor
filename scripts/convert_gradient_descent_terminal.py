from __future__ import annotations

import argparse
import html
import json
import re
import shutil
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


COMMENT_RE = re.compile(r"/%.*?%/", re.S)
SET_RE = re.compile(
    r"<<set\s+\$([A-Za-z0-9_]+)\s+to\s+(?:\"([^\"]*)\"|(-?\d+(?:\.\d+)?)|(true|false))\s*>>",
    re.I,
)
H1_RE = re.compile(r"<h1>(.*?)</h1>", re.S | re.I)
H2_RE = re.compile(r"<h2>(.*?)</h2>", re.S | re.I)
IMG_RE = re.compile(r"<img\s+[^>]*src=\"([^\"]+)\"[^>]*>", re.I)
WIKI_LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
MACRO_LINK_RE = re.compile(r"<<(?:link|button)\s+\"([^\"]+)\">>(.*?)<</(?:link|button)>>", re.S | re.I)
SCRIPT_BLOCK_RE = re.compile(r"<<script>>.*?<</script>>", re.S | re.I)
HTML_SCRIPT_RE = re.compile(r"<script[^>]*>.*?</script>", re.S | re.I)
MACRO_RE = re.compile(r"\\?<</?[A-Za-z][^>]*>>", re.S)
TAG_RE = re.compile(r"<[^>]+>")
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
GOTO_RE = re.compile(r"<<goto\s+\"([^\"]+)\">>", re.I)
ENGINE_PLAY_RE = re.compile(r"Engine\.play\('([^']+)'\)")
STATE_VAR_RE = re.compile(r"State\.variables\.([A-Za-z0-9_]+)")
WHITESPACE_RE = re.compile(r"[ \t]+")
BLANK_RE = re.compile(r"\n{3,}")
MARKDOWN_LITERAL_RE = re.compile(r"([\\`*_{}\[\]()#+\-.!>~|])")
MARKDOWN_UNESCAPE_RE = re.compile(r"\\([\\`*_{}\[\]()#+\-.!>~|])")
STRING_SET_RE = re.compile(r"<<set\s+\$([A-Za-z0-9_]+)\s+to\s+\"([^\"]*)\"\s*>>", re.I)
CONTROL_ROW_RE = re.compile(
    r"<<link\s+\"([^\"]+)\">>(((?:(?!<<link).)*?))<</link>>\s*\[\>\s*<span\s+id=\"([^\"]+)\">([^<]*)</span>[^\n]*",
    re.S | re.I,
)
ATMOSPHERE_SCREEN_ID_RE = re.compile(r"^floor-(\d+)-atmosphere(?:-flow)?$")
JS_LINE_RE = re.compile(
    r"^(?:"
    r"function\s+\w+|const\s+\w+|let\s+\w+|var\s+\w+|return\s+\w|"
    r"\.then\b|\.catch\b|console\.|sessionStorage\.|document\.|window\.|"
    r"setInterval\(|clearInterval\(|setTimeout\(|loadPasswords\(\);|updateTimer\(\);|"
    r"throw new Error|if\s*\(|\}\)?;?$|\)\s*=>\s*\{|lines\.forEach|response\.|data\.split"
    r")",
    re.I,
)

KNOWN_TEXT_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bACCES\b"), "ACCESS"),
    (re.compile(r"\bacces\b"), "access"),
    (re.compile(r"\bvaccuums\b"), "vacuums"),
    (re.compile(r"\bthe the\b"), "the"),
    (re.compile(r"\bmalfuntional\b"), "malfunctioning"),
    (re.compile(r"\bOperatin\b"), "Operating"),
    (re.compile(r"\bSuccesfull\b"), "Successful"),
    (re.compile(r"\bSuccesful\b"), "Successful"),
    (re.compile(r"\bLifesupport\b"), "Life Support"),
]

SPECIAL_TEXT_REPLACEMENTS = {
    "Choose the access point of the player.": "Choose an access point.",
}


@dataclass
class Passage:
    name: str
    tags: str
    text: str


@dataclass
class ControlRow:
    label: str
    states: tuple[str, ...]
    current: str


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


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "screen"


def clean_inline(text: str) -> str:
    value = html.unescape(text or "")
    value = value.replace("\\n", " ")
    value = TAG_RE.sub("", value)
    value = MACRO_RE.sub("", value)
    value = WHITESPACE_RE.sub(" ", value)
    return value.strip()


def escape_markdown_literal(text: str) -> str:
    return MARKDOWN_LITERAL_RE.sub(r"\\\1", text)


def unescape_markdown_literal(text: str) -> str:
    return MARKDOWN_UNESCAPE_RE.sub(r"\1", text)


def fix_known_text_issues(text: str) -> str:
    value = text
    for original, replacement in SPECIAL_TEXT_REPLACEMENTS.items():
        if value == original:
            value = replacement
    for pattern, replacement in KNOWN_TEXT_REPLACEMENTS:
        value = pattern.sub(replacement, value)
    return value


def strip_decorative_quote_prefix(lines: list[str]) -> list[str]:
    meaningful = [line for line in lines if line]
    if len(meaningful) < 3:
        return lines

    if not all(line.startswith(">") for line in meaningful):
        return lines

    stripped: list[str] = []
    for line in lines:
        if not line:
            stripped.append("")
            continue

        next_line = line[1:] if line.startswith(">") else line
        if next_line.startswith(" "):
            next_line = next_line[1:]
        stripped.append(next_line)

    return stripped


def escape_body_lines(lines: list[str]) -> list[str]:
    return [
        escape_markdown_literal(fix_known_text_issues(line)) if line else ""
        for line in lines
    ]


def parse_wiki_link(body: str) -> tuple[str, str]:
    raw = body.strip()
    if "|" in raw:
        label, target = raw.split("|", 1)
        return clean_inline(label), clean_inline(target)
    if "->" in raw:
        label, target = raw.split("->", 1)
        return clean_inline(label), clean_inline(target)
    if "<-" in raw:
        target, label = raw.split("<-", 1)
        return clean_inline(label), clean_inline(target)
    cleaned = clean_inline(raw)
    return cleaned, cleaned


def extract_initial_vars(passages: list[Passage]) -> dict[str, str]:
    values: dict[str, str] = {}
    for passage in passages:
        for match in SET_RE.finditer(passage.text):
            name = match.group(1)
            if match.group(2) is not None:
                value = match.group(2)
            elif match.group(3) is not None:
                value = match.group(3)
            else:
                value = (match.group(4) or "").lower()
            values[name] = value
    return values


def replace_vars(text: str, values: dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        name = match.group(1)
        return values.get(name, f"${name}")

    return re.sub(r"\$([A-Za-z0-9_]+)", repl, text)


def extract_macro_links(text: str) -> tuple[str, list[dict[str, str]]]:
    links: list[dict[str, str]] = []

    def repl(match: re.Match[str]) -> str:
        label = clean_inline(match.group(1))
        body = match.group(2)
        goto = GOTO_RE.search(body)
        if goto:
            links.append(
                {
                    "text": label or "> OPEN",
                    "target": clean_inline(goto.group(1)),
                }
            )
            return "\n"
        return f"\n{label}\n" if label else "\n"

    return MACRO_LINK_RE.sub(repl, text), links


def extract_wiki_links(text: str) -> tuple[str, list[dict[str, str]]]:
    links: list[dict[str, str]] = []

    def repl(match: re.Match[str]) -> str:
        label, target = parse_wiki_link(match.group(1))
        links.append({"text": label, "target": target})
        return "\n"

    return WIKI_LINK_RE.sub(repl, text), links


def clean_body_text(text: str, values: dict[str, str]) -> list[str]:
    value = text.replace("\r", "")
    value = value.replace("\\n", "\n")
    value = COMMENT_RE.sub("", value)
    value = HTML_COMMENT_RE.sub("", value)
    value = HTML_SCRIPT_RE.sub("", value)
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"</?(?:div|span)[^>]*>", "", value, flags=re.I)
    value = replace_vars(value, values)
    value = SCRIPT_BLOCK_RE.sub("", value)
    value = value.replace("<]", "]")
    value = re.sub(r"(\[\>\s*.*?(?:\]|<\]))", r"\n\1\n", value)
    value = MACRO_RE.sub("", value)
    value = TAG_RE.sub("", value)
    value = html.unescape(value)
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n[ \t]+", "\n", value)
    value = BLANK_RE.sub("\n\n", value)
    value = value.strip()

    if not value:
        return []

    lines: list[str] = []
    previous_blank = False
    for raw_line in value.split("\n"):
        line = WHITESPACE_RE.sub(" ", raw_line).strip()
        if not line or line == "\\":
            if not previous_blank:
                lines.append("")
                previous_blank = True
            continue
        if JS_LINE_RE.search(line):
            continue
        lines.append(line)
        previous_blank = False

    while lines and lines[0] == "":
        lines.pop(0)
    while lines and lines[-1] == "":
        lines.pop()
    lines = strip_decorative_quote_prefix(lines)
    return escape_body_lines(lines)


def map_asset_name(filename: str) -> str:
    stem = slugify(Path(filename).stem)
    suffix = Path(filename).suffix.lower() or ".png"
    return f"{stem}{suffix}"


def build_asset_map(passages: list[Passage]) -> dict[str, str]:
    assets: dict[str, str] = {}
    for passage in passages:
        for image_name in IMG_RE.findall(passage.text):
            assets[image_name] = f"/img/gradient-descent/{map_asset_name(image_name)}"
    return assets


def copy_assets(asset_map: dict[str, str], source_dir: Path, dest_dir: Path) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    for original_name, public_path in asset_map.items():
        source = source_dir / original_name
        if not source.exists():
            continue
        dest_name = Path(public_path).name
        shutil.copy2(source, dest_dir / dest_name)


def build_passage_referrer_map(passages: list[Passage]) -> dict[str, list[str]]:
    referrers: dict[str, list[str]] = {passage.name: [] for passage in passages}

    for passage in passages:
        raw = passage.text.replace("\r", "")
        body = COMMENT_RE.sub("", raw)
        body = HTML_COMMENT_RE.sub("", body)
        body = HTML_SCRIPT_RE.sub("", body)
        body = SCRIPT_BLOCK_RE.sub("", body)
        body = H1_RE.sub("\n", body)
        body = H2_RE.sub("\n", body)
        body = IMG_RE.sub("\n", body)
        body, macro_links = extract_macro_links(body)
        _, wiki_links = extract_wiki_links(body)

        for entry in macro_links + wiki_links:
            target_name = clean_inline(entry.get("target", ""))
            if not target_name or target_name == passage.name:
                continue

            target_referrers = referrers.setdefault(target_name, [])
            if passage.name not in target_referrers:
                target_referrers.append(passage.name)

    return referrers


def build_password_reference(passwords_path: Path) -> list[Any]:
    if not passwords_path.exists():
        return []

    lines = passwords_path.read_text(encoding="utf-8").replace("\r", "").split("\n")
    content: list[Any] = [
        make_header("PASSWORD REFERENCE"),
        "",
        escape_markdown_literal("Extracted from the bundled Gradient Descent repo snapshot."),
        "",
    ]

    previous_blank = False
    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if not previous_blank:
                content.append("")
                previous_blank = True
            continue
        content.append(escape_markdown_literal(fix_known_text_issues(line)))
        previous_blank = False

    content.extend(
        [
            "",
            {
                "type": "link",
                "text": "> BACK TO START",
                "target": "starting-screen",
            },
        ]
    )
    return content


def make_header(title: str) -> dict[str, str]:
    heading = fix_known_text_issues(clean_inline(title or "UNTITLED").lstrip("#").strip() or "UNTITLED")
    return {
        "type": "text",
        "text": f"# {escape_markdown_literal(heading)}",
    }


def make_link(label: str, target_name: str, ids_by_name: dict[str, str]) -> dict[str, str] | None:
    target_id = ids_by_name.get(target_name)
    if not target_id:
        return None

    text = clean_inline(label)
    if not text:
        text = f"> {target_name}"
    return {
        "type": "link",
        "text": text,
        "target": target_id,
    }


def collapse_blank_entries(content: list[Any]) -> list[Any]:
    collapsed: list[Any] = []
    previous_blank = False
    for entry in content:
        is_blank = isinstance(entry, str) and entry == ""
        if is_blank and previous_blank:
            continue
        collapsed.append(entry)
        previous_blank = is_blank

    while collapsed and collapsed[0] == "":
        collapsed.pop(0)
    while collapsed and collapsed[-1] == "":
        collapsed.pop()

    return collapsed


def normalize_control_label(label: str) -> str:
    cleaned = fix_known_text_issues(clean_inline(label))
    return cleaned.lstrip(">").strip() or cleaned


def rotate_states(states: list[str], current: str) -> tuple[str, ...]:
    if not states:
        return ()
    if current and current in states:
        index = states.index(current)
        ordered = states[index:] + states[:index]
        return tuple(ordered)
    if current and current not in states:
        return tuple([current] + states)
    return tuple(states)


def extract_simple_control_rows(raw: str, values: dict[str, str]) -> list[ControlRow]:
    rows: list[ControlRow] = []

    for match in CONTROL_ROW_RE.finditer(raw):
        label = normalize_control_label(match.group(1))
        body = match.group(2)

        assignments: list[tuple[str, str]] = []
        for set_match in STRING_SET_RE.finditer(body):
            variable_name = set_match.group(1)
            state_value = fix_known_text_issues(clean_inline(set_match.group(2)))
            if not state_value:
                continue
            assignments.append((variable_name, state_value))

        variable_names = {variable_name for variable_name, _ in assignments}
        if len(variable_names) != 1:
            continue

        states: list[str] = []
        for _, state_value in assignments:
            if state_value not in states:
                states.append(state_value)
        if len(states) < 2:
            continue

        variable_name = assignments[0][0]
        current = fix_known_text_issues(clean_inline(values.get(variable_name, "")))
        rows.append(
            ControlRow(
                label=label,
                states=rotate_states(states, current),
                current=current,
            )
        )

    return rows


def filter_body_lines_for_control_rows(body_lines: list[str], control_rows: list[ControlRow]) -> list[str]:
    hidden_lines: set[str] = set()
    for row in control_rows:
        normalized_label = fix_known_text_issues(WHITESPACE_RE.sub(" ", row.label).strip())
        hidden_lines.add(normalized_label)
        hidden_lines.add(f"> {normalized_label}")
        hidden_lines.add(f">{normalized_label}")
        if row.current:
            hidden_lines.add(f"[> {row.current}]")

    filtered: list[Any] = []
    for line in body_lines:
        display_line = fix_known_text_issues(
            WHITESPACE_RE.sub(" ", unescape_markdown_literal(line)).strip()
        )
        if display_line in hidden_lines:
            continue
        filtered.append(line)

    return collapse_blank_entries(filtered)


def make_image_objects(
    image_names: list[str],
    asset_map: dict[str, str],
    heading: str,
) -> list[dict[str, Any]]:
    image_objects: list[dict[str, Any]] = []
    for image_name in image_names:
        mapped = asset_map.get(image_name)
        if not mapped:
            continue
        image_objects.append(
            {
                "type": "bitmap",
                "src": mapped,
                "alt": heading,
                "fillWidth": True,
            }
        )
    return image_objects


def make_control_list_row(label: str, states: tuple[str, ...], label_width: int) -> dict[str, Any]:
    return {
        "type": "list",
        "states": [
            {
                "text": f"{label.ljust(label_width)}[> {state}]",
            }
            for state in states
        ],
    }


def make_status_line(label: str, value: str, label_width: int) -> str:
    return escape_markdown_literal(f"{label.ljust(label_width)}[> {value}]")


def build_atmosphere_snapshot_lines(screen_id: str, values: dict[str, str]) -> list[str]:
    match = ATMOSPHERE_SCREEN_ID_RE.match(screen_id)
    if not match:
        return []

    floor = match.group(1)
    nitrogen = values.get(f"Nitrogen{floor}")
    oxygen = values.get(f"Oxygen{floor}")
    temperature = values.get(f"Temperature{floor}")
    label_width = max(len("NITROGEN"), len("OXYGEN"), len("TEMPERATURE")) + 4

    lines: list[str] = ["GAS MIXTURE"]
    if nitrogen is not None:
        lines.append(make_status_line("NITROGEN", f"{nitrogen}%", label_width))
    if oxygen is not None:
        lines.append(make_status_line("OXYGEN", f"{oxygen}%", label_width))
    if temperature is not None:
        lines.extend(
            [
                "",
                make_status_line("TEMPERATURE", f"{temperature}°C", label_width),
            ]
        )
    return lines


def build_room_controls_snapshot_lines(values: dict[str, str]) -> list[str]:
    label_width = max(len("SIZE"), len("LIGHTING")) + 4
    lines: list[str] = []
    size = values.get("Size")
    lighting = values.get("Lighting")

    if size is not None:
        lines.append(make_status_line("SIZE", f"{size}%", label_width))
    if lighting is not None:
        lines.extend(
            [
                "",
                make_status_line("LIGHTING", f"{lighting}%", label_width),
            ]
        )
    return lines


def build_control_panel_content(
    heading: str,
    control_rows: list[ControlRow],
    body_lines: list[str],
    image_objects: list[dict[str, Any]],
    link_objects: list[dict[str, Any]],
) -> list[Any]:
    content: list[Any] = [make_header(heading)]

    if control_rows:
        label_width = max(len(row.label) for row in control_rows) + 4
        content.append("")
        for row in control_rows:
            content.append(make_control_list_row(row.label, row.states, label_width))
            content.append("")

    if body_lines:
        content.extend(body_lines)

    if image_objects:
        if content and content[-1] != "":
            content.append("")
        for image_object in image_objects:
            content.append(image_object)
            content.append("")

    if link_objects:
        if content and content[-1] != "":
            content.append("")
        content.extend(link_objects)

    return collapse_blank_entries(content)


def is_password_passage_name(name: str) -> bool:
    normalized = clean_inline(name)
    return "password" in normalized.lower()


def pick_first_valid_target(
    candidate_names: list[str],
    ids_by_name: dict[str, str],
    allow_password_targets: bool = True,
) -> str:
    for candidate_name in candidate_names:
        if candidate_name not in ids_by_name:
            continue
        if not allow_password_targets and is_password_passage_name(candidate_name):
            continue
        return candidate_name
    return ""


def convert_password_screen(
    passage: Passage,
    ids_by_name: dict[str, str],
    values: dict[str, str],
    referrers_by_name: dict[str, list[str]],
) -> dict[str, Any]:
    heading_match = H1_RE.search(passage.text)
    heading = clean_inline(heading_match.group(1)) if heading_match else passage.name
    success_match = ENGINE_PLAY_RE.search(passage.text)
    success_target = clean_inline(success_match.group(1)) if success_match else ""
    back_links = [parse_wiki_link(match.group(1)) for match in WIKI_LINK_RE.finditer(passage.text)]
    preferred_back_targets = [
        target
        for label, target in back_links
        if "back" in label.lower()
    ]
    any_back_targets = [target for _, target in back_links]
    referrer_targets = [
        referring_name
        for referring_name in referrers_by_name.get(passage.name, [])
        if referring_name != passage.name
    ]
    back_target = (
        pick_first_valid_target(preferred_back_targets, ids_by_name, allow_password_targets=False)
        or pick_first_valid_target(any_back_targets, ids_by_name, allow_password_targets=False)
        or pick_first_valid_target(referrer_targets, ids_by_name, allow_password_targets=False)
        or pick_first_valid_target([success_target], ids_by_name, allow_password_targets=False)
        or pick_first_valid_target(preferred_back_targets, ids_by_name)
        or pick_first_valid_target(any_back_targets, ids_by_name)
        or pick_first_valid_target(referrer_targets, ids_by_name)
        or pick_first_valid_target([success_target], ids_by_name)
    )

    password_var_match = STATE_VAR_RE.search(passage.text)
    password_var = password_var_match.group(1) if password_var_match else ""
    password_value = values.get(password_var, "")
    screen_id = ids_by_name[passage.name]
    back_action: dict[str, Any] = {
        "type": "action",
        "action": "back",
    }
    if back_target in ids_by_name:
        back_action["target"] = ids_by_name[back_target]
    if screen_id == "reception-password":
        back_action = {
            "type": "link",
            "target": "starting-screen",
        }

    commands: list[dict[str, Any]] = []
    seen_commands: set[str] = set()
    success_target_id = ids_by_name.get(success_target)
    if success_target_id:
        success_action = {
            "type": "link",
            "target": success_target_id,
        }
        if password_value:
            commands.append(
                {
                    "command": password_value,
                    "action": dict(success_action),
                }
            )
            seen_commands.add(password_value)

        if "HACK" not in seen_commands:
            commands.append(
                {
                    "command": "HACK",
                    "action": dict(success_action),
                }
            )
            seen_commands.add("HACK")

    if "back" not in seen_commands:
        commands.append(
            {
                "command": "back",
                "action": dict(back_action),
            }
        )

    content: list[Any] = [
        make_header(heading),
        "",
        escape_markdown_literal("Enter password."),
    ]

    content.extend(
        [
            "",
            {
                "type": "prompt",
                "prompt": "password> ",
                "commands": commands,
            },
        ]
    )

    content.extend(
        [
            "",
            {
                "type": "link",
                "text": "> BACK",
                "target": [dict(back_action)],
            },
        ]
    )

    return {
        "id": screen_id,
        "type": "screen",
        "content": content,
    }


def convert_regular_screen(
    passage: Passage,
    ids_by_name: dict[str, str],
    values: dict[str, str],
    asset_map: dict[str, str],
) -> dict[str, Any]:
    raw = passage.text.replace("\r", "")
    heading_match = H1_RE.search(raw)
    heading = clean_inline(heading_match.group(1)) if heading_match else passage.name
    screen_id = ids_by_name[passage.name]
    subheadings = [clean_inline(item) for item in H2_RE.findall(raw) if clean_inline(item)]
    images = IMG_RE.findall(raw)

    body = COMMENT_RE.sub("", raw)
    body = H1_RE.sub("\n", body)
    body = H2_RE.sub("\n", body)
    body = IMG_RE.sub("\n", body)
    body, macro_links = extract_macro_links(body)
    body, wiki_links = extract_wiki_links(body)
    body_lines = clean_body_text(body, values)
    image_objects = make_image_objects(images, asset_map, heading)
    control_rows = extract_simple_control_rows(raw, values)

    content: list[Any] = [make_header(heading)]

    for subheading in subheadings:
        content.extend(
            [
                "",
                {
                    "type": "text",
                    "className": "notice",
                    "text": escape_markdown_literal(subheading),
                },
            ]
        )

    if body_lines:
        content.append("")
        content.extend(body_lines)

    for image_object in image_objects:
        content.extend(["", image_object])

    link_entries = macro_links + wiki_links
    link_objects = [
        make_link(entry["text"], entry["target"], ids_by_name)
        for entry in link_entries
    ]
    link_objects = [entry for entry in link_objects if entry]
    if link_objects:
        content.append("")
        content.extend(link_objects)

    screen: dict[str, Any] = {
        "id": screen_id,
        "type": "screen",
        "content": content,
    }

    if screen_id == "automated-turrets":
        turret_labels = [
            "MACHINE GUN 1",
            "MACHINE GUN 2",
            "MACHINE GUN 3",
            "MACHINE GUN 4",
            "GRENADE LAUNCHER",
        ]
        turret_states = ("NON-CHOSEN", "ALL", "FALLEN", "OFF")
        label_width = max(len(label) for label in turret_labels) + 4
        back_link = next(
            (
                entry
                for entry in link_objects
                if isinstance(entry, dict) and entry.get("type") == "link" and entry.get("text") == "> BACK"
            ),
            {
                "type": "link",
                "text": "> BACK",
                "target": "floor-2-defense",
            },
        )

        turret_rows: list[Any] = [make_header(heading), ""]
        for label in turret_labels:
            turret_rows.append(
                {
                    "type": "list",
                    "states": [
                        {
                            "text": f"{label.ljust(label_width)}[> {state}]",
                        }
                        for state in turret_states
                    ],
                }
            )
            turret_rows.append("")

        turret_rows.append(back_link)
        screen["content"] = turret_rows
    elif control_rows:
        if screen_id == "room-controls":
            panel_body_lines = build_room_controls_snapshot_lines(values)
        else:
            atmosphere_body_lines = build_atmosphere_snapshot_lines(screen_id, values)
            panel_body_lines = (
                atmosphere_body_lines
                if atmosphere_body_lines
                else filter_body_lines_for_control_rows(body_lines, control_rows)
            )

        screen["content"] = build_control_panel_content(
            heading,
            control_rows,
            panel_body_lines,
            image_objects,
            link_objects,
        )

    goto_match = GOTO_RE.search(raw)
    if passage.name.startswith("Boot Sequence") and goto_match:
        target_id = ids_by_name.get(clean_inline(goto_match.group(1)))
        if target_id:
            screen["onDone"] = {
                "target": target_id,
                "delayMs": 2600,
            }

    return screen


def convert_story(
    passages: list[Passage],
    values: dict[str, str],
    asset_map: dict[str, str],
    passwords_path: Path,
) -> dict[str, Any]:
    ids_by_name = {passage.name: slugify(passage.name) for passage in passages}
    referrers_by_name = build_passage_referrer_map(passages)
    screens: list[dict[str, Any]] = []
    blocked_targets = {
        target_id
        for passage_name, target_id in ids_by_name.items()
        if passage_name == "Settings"
    }

    password_reference = build_password_reference(passwords_path)
    if password_reference:
        screens.append(
            {
                "id": "password-reference",
                "type": "screen",
                "content": password_reference,
            }
        )

    for passage in passages:
        if passage.name == "Starting Screen":
            continue
        if passage.name == "Settings":
            continue
        if "Password" in passage.name:
            screens.append(convert_password_screen(passage, ids_by_name, values, referrers_by_name))
            continue
        screens.append(convert_regular_screen(passage, ids_by_name, values, asset_map))

    starting = next((passage for passage in passages if passage.name == "Starting Screen"), None)
    if starting:
        starting_screen = convert_regular_screen(starting, ids_by_name, values, asset_map)
    else:
        starting_screen = {
            "id": "starting-screen",
            "type": "screen",
            "content": [make_header("START")],
        }

    intro = [
        {
            "type": "text",
            "className": "notice",
            "text": escape_markdown_literal("Converted from PimPee/GradientDescentTerminal (Twine/SugarCube) into a Phosphor archive script."),
        },
        escape_markdown_literal("Twine-only control logic is flattened to readable terminal snapshots in this export."),
    ]
    starting_screen["content"] = (
        [starting_screen["content"][0], ""]
        + intro
        + [
            "",
            {
                "type": "link",
                "text": "> PASSWORD REFERENCE",
                "target": "password-reference",
            },
            "",
        ]
        + starting_screen["content"][1:]
    )
    starting_screen["content"] = collapse_blank_entries([
        entry
        for entry in starting_screen["content"]
        if not (
            isinstance(entry, str)
            and (
                "Click Settings to change the look of the terminal" in entry
                or "Standard time from clicking" in entry
                or "adjust the duration below" in entry
            )
        )
    ])

    screens.insert(0, starting_screen)
    if blocked_targets:
        for screen in screens:
            filtered_content: list[Any] = []
            for entry in screen.get("content", []):
                if not isinstance(entry, dict):
                    filtered_content.append(entry)
                    continue

                if entry.get("type") == "link":
                    entry_target = entry.get("target")
                    if isinstance(entry_target, str) and entry_target in blocked_targets:
                        continue

                    if isinstance(entry_target, list):
                        next_targets = []
                        for target_entry in entry_target:
                            if not isinstance(target_entry, dict):
                                next_targets.append(target_entry)
                                continue

                            nested_target = target_entry.get("target")
                            if isinstance(nested_target, str) and nested_target in blocked_targets:
                                continue

                            next_targets.append(target_entry)

                        if not next_targets:
                            continue

                        filtered_content.append({
                            **entry,
                            "target": next_targets,
                        })
                        continue

                if entry.get("type") == "prompt":
                    next_commands = [
                        command
                        for command in entry.get("commands", [])
                        if command.get("action", {}).get("type") not in {"link", "action"}
                        or command.get("action", {}).get("target") not in blocked_targets
                    ]
                    filtered_content.append({
                        **entry,
                        "commands": next_commands,
                    })
                    continue

                filtered_content.append(entry)

            screen["content"] = collapse_blank_entries(filtered_content)

            on_done = screen.get("onDone")
            if isinstance(on_done, dict) and on_done.get("target") in blocked_targets:
                del screen["onDone"]

    return {
        "config": {
            "name": "Gradient Descent Terminal Archive",
            "author": "PimPee / converted for Phosphor",
            "script": None,
            "theme": "green",
            "defaultTextSpeed": 12,
        },
        "screens": screens,
        "dialogs": [],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-html", type=Path, required=True)
    parser.add_argument("--source-passwords", type=Path, required=True)
    parser.add_argument("--source-assets", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--output-assets", type=Path, required=True)
    args = parser.parse_args()

    passages = load_passages(args.source_html)
    values = extract_initial_vars(passages)
    asset_map = build_asset_map(passages)
    copy_assets(asset_map, args.source_assets, args.output_assets)
    story = convert_story(passages, values, asset_map, args.source_passwords)

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(story, indent=4, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    screen_ids = {screen["id"] for screen in story["screens"]}
    missing_targets: list[str] = []
    for screen in story["screens"]:
        for entry in screen.get("content", []):
            if isinstance(entry, dict) and entry.get("type") == "link":
                target = entry.get("target")
                if isinstance(target, str):
                    if target not in screen_ids:
                        missing_targets.append(f"{screen['id']} -> {target}")
                elif isinstance(target, list):
                    for target_entry in target:
                        if not isinstance(target_entry, dict):
                            continue
                        nested_target = target_entry.get("target")
                        if isinstance(nested_target, str) and nested_target not in screen_ids:
                            missing_targets.append(f"{screen['id']} -> {nested_target}")
            if isinstance(entry, dict) and entry.get("type") == "prompt":
                for command in entry.get("commands", []):
                    action_type = command.get("action", {}).get("type")
                    target = command.get("action", {}).get("target")
                    if action_type in {"link", "action"} and isinstance(target, str) and target not in screen_ids:
                        missing_targets.append(f"{screen['id']} prompt -> {target}")
        on_done_target = screen.get("onDone", {}).get("target")
        if on_done_target and on_done_target not in screen_ids:
            missing_targets.append(f"{screen['id']} onDone -> {on_done_target}")

    print(f"Converted {len(passages)} passages into {len(story['screens'])} screens.")
    print(f"Copied {len(asset_map)} assets.")
    if missing_targets:
        print("Missing targets:")
        for item in missing_targets:
            print(item)


if __name__ == "__main__":
    main()
