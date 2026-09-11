"""
MachPulse LLM provider abstraction (Phase 4).

This package contains ONLY the plumbing that lets a language model *explain*
already-computed MachPulse evidence. No machine-learning happens here:

    ML pipeline output  ->  evidence_service  ->  reasoning_service  ->  llm (this pkg)

The provider abstraction (`base.LLMProvider`) keeps MachPulse from becoming
permanently dependent on any single vendor. `claude_provider` is implemented
for development/testing; `local_provider` is a thin OpenAI-compatible client
for a future on-premise inference server. Selection is by environment variable
(`MACHPULSE_LLM_PROVIDER`); see `settings.py`.
"""
