use openchannel::{
    approval_requested, message_received, ActionInvocation, ActorRef, ActorType, AgentCard,
    AgentDefinition, AgentHost, EventEnvelope, StderrLogger,
};

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

    let mut event = message_received("Explain why OCP keeps policy outside the model prompt.");
    event.actor = Some(ActorRef {
        actor_type: ActorType::Human,
        id: "human:example".to_owned(),
        display_name: "Example User".to_owned(),
        ..ActorRef::default()
    });
    event.recipient = Some(ActorRef::agent("agent:rust", "Native Rust Agent"));
    let result = host.handle(&event, &StderrLogger)?;

    println!("handled: {}", result.handled);
    println!("replies: {}", result.replies.len());
    println!("reply: {}", serde_json::to_string_pretty(&result.replies[0].to_json()?)?);

    // Approval payloads are real protobuf too: encode, then decode.
    let agent = ActorRef::agent("agent:rust", "Native Rust Agent");
    let approver = ActorRef {
        actor_type: ActorType::Human,
        id: "human:finance".to_owned(),
        display_name: "Finance Approver".to_owned(),
        ..ActorRef::default()
    };
    let refund = ActionInvocation {
        action_id: "action:refund-1".to_owned(),
        input: serde_json::json!({ "amount": 250, "currency": "USD" }),
        action_type: "refund".to_owned(),
        target: "customer:42".to_owned(),
        ..ActionInvocation::default()
    };
    let approval = approval_requested(
        &refund,
        "approval:refund-1",
        "refund over the agent limit",
        &agent,
        &approver,
        Some("2030-01-01T00:00:00.500Z".to_owned()),
    );
    let bytes = approval.to_binary()?;
    let decoded = EventEnvelope::from_binary(&bytes)?;
    println!("approval: {} in {} protobuf bytes", decoded.event_type(), bytes.len());
    Ok(())
}
