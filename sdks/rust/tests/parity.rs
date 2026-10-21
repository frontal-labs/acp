//! Cross-language parity: decodes the TypeScript-produced fixture, checks the derived event
//! name, and re-encodes to byte-identical protobuf.

use std::fs;
use std::path::PathBuf;

use open_channel::{event_type_of, EventEnvelope, ProtocolVersion};
use serde_json::Value;

const FIXTURE: &str = "../../packages/protocol/tests/fixtures/event-parity.json";

/// Standard base64 (RFC 4648, with padding) decoder for the fixture's `binary` field.
fn base64_decode(input: &str) -> Vec<u8> {
    fn sextet(byte: u8) -> u32 {
        match byte {
            b'A'..=b'Z' => u32::from(byte - b'A'),
            b'a'..=b'z' => u32::from(byte - b'a') + 26,
            b'0'..=b'9' => u32::from(byte - b'0') + 52,
            b'+' => 62,
            b'/' => 63,
            other => panic!("invalid base64 byte {other:#x}"),
        }
    }
    let mut output = Vec::with_capacity(input.len() / 4 * 3);
    let bytes: Vec<u8> = input.bytes().filter(|byte| *byte != b'=').collect();
    for chunk in bytes.chunks(4) {
        let mut value = 0u32;
        for (index, byte) in chunk.iter().enumerate() {
            value |= sextet(*byte) << (18 - 6 * index);
        }
        let count = chunk.len() - 1;
        for index in 0..count {
            output.push((value >> (16 - 8 * index)) as u8);
        }
    }
    output
}

#[test]
fn every_fixture_entry_decodes_by_type_and_re_encodes_identically() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(FIXTURE);
    let text = fs::read_to_string(&path).expect("read parity fixture");
    let entries: Vec<Value> = serde_json::from_str(&text).expect("fixture is a JSON array");
    assert_eq!(entries.len(), 30, "fixture covers 15 kinds in two protocol versions");

    let mut failures = Vec::new();
    for entry in &entries {
        let name = entry["name"].as_str().expect("name");
        let version_text = entry["protocolVersion"].as_str().expect("protocolVersion");
        let expected_type = entry["eventType"].as_str().expect("eventType");
        let binary = entry["binary"].as_str().expect("binary");
        let version = ProtocolVersion::parse(version_text).expect("known protocol version");
        let original = base64_decode(binary);

        let outcome = EventEnvelope::from_binary(&original, version)
            .map_err(|error| format!("{name}: decode failed: {error}"));
        let event = match outcome {
            Ok(event) => event,
            Err(message) => {
                failures.push(message);
                continue;
            }
        };
        if event_type_of(&event) != expected_type {
            failures.push(format!(
                "{name}: derived {} but fixture says {expected_type}",
                event_type_of(&event)
            ));
        }
        match event.to_binary() {
            Ok(bytes) if bytes == original => {}
            Ok(bytes) => failures.push(format!(
                "{name}: re-encoded {} bytes differ from fixture {} bytes",
                bytes.len(),
                original.len()
            )),
            Err(error) => failures.push(format!("{name}: re-encode failed: {error}")),
        }
    }
    assert!(
        failures.is_empty(),
        "{} of 30 entries failed:\n{}",
        failures.len(),
        failures.join("\n")
    );
}

#[test]
fn fixture_action_input_is_parsed_back_from_parameters() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(FIXTURE);
    let entries: Vec<Value> =
        serde_json::from_str(&fs::read_to_string(path).expect("read fixture")).expect("json");
    let entry = entries.iter().find(|entry| entry["name"] == "actionExecuted-0.2").expect("entry");
    let event = EventEnvelope::from_binary(
        &base64_decode(entry["binary"].as_str().expect("binary")),
        ProtocolVersion::V0_2,
    )
    .expect("decodes");
    let open_channel::EventPayload::ActionExecuted(payload) = event.payload else {
        panic!("expected action.executed");
    };
    let action = payload.action.expect("action present");
    assert_eq!(action.input, serde_json::json!({ "value": 2 }));
    assert_eq!(action.action_type, "customer.reply");
    assert_eq!(action.target, "customer:1");
    assert_eq!(payload.result, r#"{"ok":true}"#);
}
