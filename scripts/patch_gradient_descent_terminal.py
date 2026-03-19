import json
from pathlib import Path
from typing import Any, Dict, List, Optional


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "src" / "data" / "gradient-descent-terminal.json"
ROOM_CONTROLS_SCREEN_ID = "room-controls"


def make_action_target(action: str, target: Optional[str] = None, **extra: Any) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "type": "action",
        "action": action,
    }
    if target is not None:
        payload["target"] = target
    payload.update(extra)
    return payload


def make_link(text: str, target: Any, script_id: Optional[str] = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "type": "link",
        "text": text,
        "target": target,
    }
    if script_id is not None:
        payload["scriptId"] = script_id
    return payload


def make_list(states: List[Dict[str, Any]], script_id: Optional[str] = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "type": "list",
        "states": states,
    }
    if script_id is not None:
        payload["scriptId"] = script_id
    return payload


def make_text(text: str, script_id: Optional[str] = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "type": "text",
        "text": text,
    }
    if script_id is not None:
        payload["scriptId"] = script_id
    return payload


def make_prompt(prompt: str, action: str) -> Dict[str, Any]:
    return {
        "type": "prompt",
        "prompt": prompt,
        "allowFreeInput": True,
        "inputAction": {
            "type": "action",
            "action": action,
        },
    }


def pad_label(label: str) -> str:
    return label.ljust(28)


def format_inline(label: str, value: str) -> str:
    return f"{pad_label(label)}[> {value}]"


def get_screen(data: Dict[str, Any], screen_id: str) -> Dict[str, Any]:
    for screen in data["screens"]:
        if screen.get("id") == screen_id:
            return screen
    raise KeyError(f"Missing screen: {screen_id}")


def get_last_link_target(screen: Dict[str, Any]) -> Any:
    for item in reversed(screen.get("content", [])):
        if isinstance(item, dict) and item.get("type") == "link":
            return item.get("target")
    raise KeyError(f"No link target found for {screen.get('id')}")


def get_link_by_text(screen: Dict[str, Any], text: str) -> Dict[str, Any]:
    for item in screen.get("content", []):
        if isinstance(item, dict) and item.get("type") == "link" and item.get("text") == text:
            return item
    raise KeyError(f"Missing link {text} on {screen.get('id')}")


def get_password_command(data: Dict[str, Any], screen_id: str) -> str:
    screen = get_screen(data, screen_id)
    for item in screen.get("content", []):
        if isinstance(item, dict) and item.get("type") == "prompt":
            for command in item.get("commands", []):
                value = command.get("command")
                if isinstance(value, str) and value != "HACK":
                    return value
    raise KeyError(f"Missing password command for {screen_id}")


def build_atmosphere_screen(screen_id: str, back_target: Any) -> List[Any]:
    return [
        make_text("# ATMOSPHERE"),
        "",
        make_list(
            [
                {
                    "text": format_inline("ATMOSPHERE REPLENISHMENT", "ON"),
                    "active": True,
                    "action": "setAtmosphereReplenishment",
                    "target": f"{screen_id}:on",
                },
                {
                    "text": format_inline("ATMOSPHERE REPLENISHMENT", "OFF"),
                    "action": "setAtmosphereReplenishment",
                    "target": f"{screen_id}:off",
                },
            ],
            script_id="atmosphereReplenishment",
        ),
        "",
        "GAS MIXTURE",
        make_link(
            format_inline("NITROGEN", "78%"),
            [
                make_action_target("adjustAtmosphere", screen_id, field="nitrogen", delta=1),
                make_action_target("adjustAtmosphere", screen_id, field="nitrogen", delta=-1, shiftKey=True),
            ],
            script_id="atmosphereNitrogen",
        ),
        make_link(
            format_inline("OXYGEN", "22%"),
            [
                make_action_target("adjustAtmosphere", screen_id, field="oxygen", delta=1),
                make_action_target("adjustAtmosphere", screen_id, field="oxygen", delta=-1, shiftKey=True),
            ],
            script_id="atmosphereOxygen",
        ),
        "",
        make_link(
            format_inline("TEMPERATURE", "22°C"),
            [
                make_action_target("adjustAtmosphere", screen_id, field="temperature", delta=1),
                make_action_target("adjustAtmosphere", screen_id, field="temperature", delta=-1, shiftKey=True),
            ],
            script_id="atmosphereTemperature",
        ),
        "",
        "======",
        make_link("< BACK", back_target),
    ]


def build_escape_pod_screen(back_target: Any) -> List[Any]:
    content: List[Any] = [
        make_text("# ESCAPE POD BAY"),
        "",
    ]
    for pod_number in range(1, 12):
        content.append(
            make_list(
                [
                    {
                        "text": format_inline(f"LAUNCH ESCAPE POD {pod_number}", "DOCKED"),
                        "active": True,
                        "action": "setEscapePodState",
                        "target": f"pod-{pod_number}:docked",
                    },
                    {
                        "text": format_inline(f"LAUNCH ESCAPE POD {pod_number}", "LAUNCHED"),
                        "action": "setEscapePodState",
                        "target": f"pod-{pod_number}:launched",
                    },
                ],
                script_id=f"escapePod{pod_number}",
            )
        )
    content.extend([
        "",
        "Do not mess with these\\.\\.\\.",
        "",
        "======",
        make_link("< BACK", back_target),
    ])
    return content


def build_monarch_screen(back_target: Any) -> List[Any]:
    return [
        make_text("# MONARCH"),
        "",
        "Speak, King of Eden\\!",
        "",
        make_prompt("speak> ", "monarchSpeak"),
        "",
        make_text("", script_id="monarchEcho"),
        "",
        "======",
        make_link("< BACK", back_target),
    ]


def build_admin_screen(data: Dict[str, Any], life_support_target: Any, log_off_target: Any) -> List[Any]:
    lines = [
        ("ADMIN", "admin-password"),
        ("RECEPTION", "reception-password"),
        ("INTRANET", "floor-1-intranet-router-password"),
        ("LOGISTICS", "logistics-router-password"),
        ("SECURITY", "security-router-password"),
        ("LIFE SUPPORT", "floor-1-life-support-password"),
    ]
    content: List[Any] = [
        make_text("# ADMIN"),
        "",
    ]
    for label, screen_id in lines:
        content.append(f"{label}: {get_password_command(data, screen_id)}")
    content.extend([
        "",
        make_link("> LIFE SUPPORT HUB", life_support_target),
        make_link("> LOG OFF", log_off_target),
    ])
    return content


def build_mind_zoo_screen(shutdown_target: Any) -> List[Any]:
    return [
        make_text("# MENU"),
        "",
        make_link("> HUNTER-7X", "hunter-7x"),
        make_link("> FELIDAE-9C", "felidae-9c"),
        make_link("> KRAKEN-11Q", "kraken-11q"),
        make_link("> VERMIS-12S", "vermis-12s"),
        "",
        "\\[\\> CORRUPTED\\]",
        "\\[\\> CORRUPTED\\]",
        "\\[\\> CORRUPTED\\]",
        "\\[\\> CORRUPTED\\]",
        "\\[\\> CORRUPTED\\]",
        "\\[\\> CORRUPTED\\]",
        "\\[\\> CORRUPTED\\]",
        "\\[\\> CORRUPTED\\]",
        "\\[\\> CORRUPTED\\]",
        "\\[\\> CORRUPTED\\]",
        "",
        "======",
        make_link("< SHUT DOWN", shutdown_target),
    ]


def build_qa_screen(log_off_target: Any, shutdown_target: Any) -> List[Any]:
    return [
        make_text("# QA INSPECTION"),
        "",
        "RELEASE SUBJECT\\#:",
        make_prompt("subject> ", "qaReleaseSubject"),
        make_text("", script_id="qaReleaseSubject"),
        "",
        make_list(
            [
                {
                    "text": format_inline("QUARANTINE ACCESS", "LOCKED"),
                    "active": True,
                    "action": "setQaQuarantineAccess",
                    "target": "locked",
                },
                {
                    "text": format_inline("QUARANTINE ACCESS", "OPEN"),
                    "action": "setQaQuarantineAccess",
                    "target": "open",
                },
            ],
            script_id="qaQuarantineAccess",
        ),
        make_list(
            [
                {
                    "text": format_inline("PURGE QUARANTINE", "READY"),
                    "active": True,
                    "action": "setQaPurgeState",
                    "target": "ready",
                },
                {
                    "text": format_inline("PURGE QUARANTINE", "PURGE ACTIVATED"),
                    "action": "setQaPurgeState",
                    "target": "purged",
                },
            ],
            script_id="qaPurgeQuarantine",
        ),
        "",
        make_link("> LOG OFF", log_off_target),
        "",
        "======",
        make_link("< SHUT DOWN", shutdown_target),
    ]


def build_room_controls_screen(shutdown_target: Any) -> List[Any]:
    return [
        make_text("# ROOM CONTROLS"),
        "",
        make_list(
            [
                {
                    "text": format_inline("FURNITURE", "MINIMAL"),
                    "active": True,
                },
                {
                    "text": format_inline("FURNITURE", "COMFORTABLE"),
                },
                {
                    "text": format_inline("FURNITURE", "LUXURY"),
                },
            ]
        ),
        make_list(
            [
                {
                    "text": format_inline("SMELL", "UNPLEASANT"),
                    "active": True,
                },
                {
                    "text": format_inline("SMELL", "NEUTRAL"),
                },
                {
                    "text": format_inline("SMELL", "PLEASANT"),
                },
                {
                    "text": format_inline("SMELL", "PHEROMONE"),
                },
            ]
        ),
        make_list(
            [
                {
                    "text": format_inline("LIGHT", "ON"),
                    "active": True,
                },
                {
                    "text": format_inline("LIGHT", "OFF"),
                },
            ]
        ),
        make_link(
            format_inline("LIGHTING", "50%"),
            [
                make_action_target("adjustRoomControl", ROOM_CONTROLS_SCREEN_ID, field="lighting", delta=5),
                make_action_target(
                    "adjustRoomControl",
                    ROOM_CONTROLS_SCREEN_ID,
                    field="lighting",
                    delta=-5,
                    shiftKey=True,
                ),
            ],
            script_id="roomControlsLighting",
        ),
        make_link(
            format_inline("ROOM SIZE", "50%"),
            [
                make_action_target("adjustRoomControl", ROOM_CONTROLS_SCREEN_ID, field="size", delta=5),
                make_action_target(
                    "adjustRoomControl",
                    ROOM_CONTROLS_SCREEN_ID,
                    field="size",
                    delta=-5,
                    shiftKey=True,
                ),
            ],
            script_id="roomControlsSize",
        ),
        "",
        "======",
        make_link("< SHUT DOWN", shutdown_target),
    ]


def build_circle_controls_screen(back_target: Any) -> List[Any]:
    return [
        make_text("# CIRCLE CONTROLS"),
        "",
        make_text("CYCLE: 3631205", script_id="circleCycle"),
        make_text("TIME UNTIL RESET: 00:52", script_id="circleReset"),
        "",
        "LOGICAL CIRCLE: > ALL CONNECTIONS FUNCTIONAL",
        "TECHNICAL CIRCLE: > ALL CONNECTIONS FUNCTIONAL",
        "MATHEMATICAL CIRCLE: > ALL CONNECTIONS FUNCTIONAL",
        "EMOTIONAL CIRCLE: > ALL CONNECTIONS FUNCTIONAL",
        "",
        "RELEASE SUBJECT\\#:",
        make_prompt("subject> ", "circleReleaseSubject"),
        make_text("", script_id="circleReleaseSubject"),
        "",
        "======",
        make_link("< BACK", back_target),
    ]


def list_label(list_element: Dict[str, Any]) -> str:
    states = list_element.get("states", [])
    if not states:
        return ""
    text = states[0].get("text", "")
    return text.split("[>")[0].strip()


def build_o2_backup_bravo_list() -> Dict[str, Any]:
    return make_list(
        [
            {
                "text": format_inline("SECURITY CHECKPOINT BRAVO", "OFF"),
                "active": True,
            },
            {
                "text": format_inline("SECURITY CHECKPOINT BRAVO", "ON"),
            },
        ]
    )


def patch_o2_backup_screen(screen: Dict[str, Any]) -> None:
    log_off_link = get_link_by_text(screen, "> LOG OFF")
    lists = [
        item for item in screen.get("content", [])
        if isinstance(item, dict) and item.get("type") == "list"
    ]

    cleaned_lists: List[Dict[str, Any]] = []
    bravo_inserted = False
    for item in lists:
        label = list_label(item)
        if label == "SECURITY CHECKPOINT BRAVO":
            continue

        cleaned_lists.append(item)
        if label == "SECURITY CHECKPOINT ALPHA" and not bravo_inserted:
            cleaned_lists.append(build_o2_backup_bravo_list())
            bravo_inserted = True

    if not bravo_inserted:
        cleaned_lists.append(build_o2_backup_bravo_list())

    screen["content"] = [
        make_text("# O2 FLOW BACKUP"),
        "",
        *cleaned_lists,
        "",
        make_link("> LOG OFF", log_off_link.get("target")),
    ]


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    data.setdefault("config", {})["script"] = "gradient-descent-terminal"

    starting_screen = get_screen(data, "starting-screen")
    for index, item in enumerate(starting_screen.get("content", [])):
        if item == "Twine\\-only control logic is flattened to readable terminal snapshots in this export\\.":
            starting_screen["content"][index] = "Stateful controls are recreated where supported by Phosphor script hooks\\."

    atmosphere_screen_ids = [
        "floor-1-atmosphere",
        "floor-2-atmosphere",
        "floor-3-atmosphere",
        "floor-1-atmosphere-flow",
        "floor-2-atmosphere-flow",
        "floor-3-atmosphere-flow",
        "floor-4-atmosphere-flow",
        "floor-5-atmosphere-flow",
        "floor-6-atmosphere-flow",
    ]
    for screen_id in atmosphere_screen_ids:
        screen = get_screen(data, screen_id)
        screen["content"] = build_atmosphere_screen(screen_id, get_last_link_target(screen))

    escape_pod_bay = get_screen(data, "escape-pod-bay")
    escape_pod_bay["content"] = build_escape_pod_screen(get_last_link_target(escape_pod_bay))

    monarch_link = get_screen(data, "monarch-link")
    monarch_link["content"] = build_monarch_screen(get_last_link_target(monarch_link))

    admin = get_screen(data, "admin")
    admin["content"] = build_admin_screen(
        data,
        get_link_by_text(admin, "> LIFE SUPPORT HUB").get("target"),
        get_link_by_text(admin, "> LOG OFF").get("target"),
    )

    mind_zoo = get_screen(data, "mind-zoo")
    mind_zoo["content"] = build_mind_zoo_screen(get_last_link_target(mind_zoo))

    qa_inspection = get_screen(data, "qa-inspection")
    qa_inspection["content"] = build_qa_screen(
        get_link_by_text(qa_inspection, "> LOG OFF").get("target"),
        get_last_link_target(qa_inspection),
    )

    room_controls = get_screen(data, "room-controls")
    room_controls["content"] = build_room_controls_screen(get_last_link_target(room_controls))

    circle_controls = get_screen(data, "circle-controls")
    circle_controls["content"] = build_circle_controls_screen(get_last_link_target(circle_controls))

    patch_o2_backup_screen(get_screen(data, "o2-flow-backup"))

    DATA_PATH.write_text(
        json.dumps(data, indent=4, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
