use acp_sdk::{ActorRef, ActorType, AgentCard, AgentDefinition, AgentHost, EventEnvelope};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut host = AgentHost::new();
    host.register(AgentDefinition::new(
        AgentCard::new("agent:rust", "Native Rust Agent"),
        |context| {
            let text = format!("Deterministic response to: {}", context.message.text);
            context.reply(text);
            Ok(())
        },
    ))?;

    let event = EventEnvelope::message_received(
        Some(ActorRef {
            actor_type: ActorType::Human,
            id: "human:example".to_owned(),
            display_name: "Example User".to_owned(),
            ..ActorRef::default()
        }),
        Some(ActorRef::agent("agent:rust", "Native Rust Agent")),
        "Explain why ACP keeps policy outside the model prompt.",
    );
    let result = host.handle(&event)?;

    println!("handled: {}", result.handled);
    println!("replies: {}", result.replies.len());
    println!("reply: {}", serde_json::to_string_pretty(&result.replies[0].to_proto_json()?)?);
    Ok(())
}
