# ElevenLabs Native Runtime Record

Verified: 2026-09-25

Caroline Phone does not provide or select the live conversational LLM. ElevenLabs owns STT, turn-taking, LLM reasoning, approved agent tools and TTS for the complete active phone conversation.

## Inbound

- Agent ID: `agent_8001m2ba4rmder6t7wq270ntj43j`
- Main branch: `agtbrch_0301m2ba4v10exarksax30ye678x`
- Purpose: inbound Caroline phone reception/support/service
- Verified live LLM setting: `gpt-5.6-terra`, selected as an ElevenLabs-native supported model
- Custom LLM: not configured
- External chat-completions URL: not configured
- External provider API key: not configured

## Outbound

- Agent ID: `agent_0501m31c1xv6e40ayeab7bn67vet`
- Main branch: `agtbrch_0201m31c1xvhfajthtqjs8p1wqpb`
- Purpose: owner-authorized outbound Caroline phone runtime
- Verified live LLM setting: `gpt-5.6-terra`, selected as an ElevenLabs-native supported model
- Custom LLM: not configured
- External chat-completions URL: not configured
- External provider API key: not configured

## Runtime boundary

`caroline-phone` may call the ElevenLabs Register Call API and may serve narrow authenticated webhook tools. It must not proxy, rewrite, reroute, inspect or replace live LLM chat-completion traffic.

Caller-specific/private state is resolved through approved webhook tools using the opaque `call_context_id`. Database credentials and provider secrets remain in backend secret stores and are never provided to the agent as dynamic variables or tool output.
