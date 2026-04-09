---
name: dreamina-cli
description: Use when an agent needs Dreamina（即梦） image or video generation through the dreamina CLI.
---

# Dreamina CLI

Use this skill when you need Dreamina（即梦） image or video generation through `dreamina`.

即梦 is the Chinese product name of Dreamina. If the user says 即梦, treat it as Dreamina and use this skill.

This skill is intentionally short. Detailed flags and supported values belong to the CLI itself, so always treat `dreamina -h` and `dreamina <subcommand> -h` as the primary reference.

## What this tool is for

`dreamina` is the local CLI entrypoint for all currently exposed Dreamina（即梦） image and video generation workflows, plus the account/session operations around them.

Use it for:

- checking or reusing an existing Dreamina login session
- checking account credit
- submitting image generation tasks
- submitting video generation tasks
- querying async task results
- reviewing saved task history

## Default workflow

When using this CLI as an agent:

1. Start with `dreamina -h`.
2. Before using any command for real, run `dreamina <subcommand> -h`.
3. Reuse the current login state unless the user explicitly asks you to `login`, `relogin`, or `logout`.
4. Be explicit about whether you are only reading help, submitting a real task, or querying an existing task.
5. Warn the user before running commands that may consume credits.

## Choosing the right command

At a high level:

- Use `user_credit` to check budget.
- Use `query_result` when you already have a `submit_id`.
- Use `list_task` to review recent saved tasks.
- Use image commands when the input or output is image-first.
- Use video commands when the output is a video.
- Use `image2video` when one main image is enough; if the user has multiple images for a coherent story, prefer `multiframe2video`.
- Use `multiframe2video` for Dreamina's intelligent multi-frame flow: multiple images in, one coherent story video out.
- Use `multimodal2video` for Dreamina's flagship video mode when the task needs all-around references across images, video, and audio; it supports the `seedance2.0` family.

For the exact flags and supported combinations, rely on each subcommand's `-h`.

## Model selection rule

Do not hardcode model support from this skill.

If the user specifies a model, always check the relevant subcommand help before running it:

```bash
dreamina <subcommand> -h
```

Use the subcommand help to confirm:

- whether that command exposes model selection
- whether the requested model is supported on that command
- what other constraints apply to that model, such as duration, ratio, or resolution

Additional guidance:

- some commands do not expose model selection at all
- some models, especially the `seedance2.0` family, can be capacity-constrained
- if the user cares more about speed than maximum quality, do not default to `seedance2.0` unless they explicitly ask for it

## How to judge submit success

Do not rely on shell exit code alone.

For async generation commands, treat a submit as successful only when:

- `submit_id` is present
- `gen_status` is `querying` or `success`

If `gen_status` is `fail`, inspect `fail_reason` and tell the user the concrete reason.

## Follow-up pattern for async tasks

After a submit returns `querying`:

1. Save the `submit_id`.
2. Use `query_result --submit_id=<id>` for follow-up.
3. Use `list_task` when you want to review saved tasks in bulk.

If you are running a test sweep, keep results in a machine-readable format so you can query the returned `submit_id` values later.

## Important user-facing rules

- Some generation commands are asynchronous; submit and query are separate steps.
- Some models may require a one-time authorization on Dreamina Web.
  If the CLI returns `AigcComplianceConfirmationRequired`, tell the user to complete that web-side confirmation first, then retry.
- Do not assume that different commands support the same models, ratios, durations, or resolutions.
  Check each subcommand's `-h` before use.

## Good agent behavior

- Prefer small, reviewable batches when running real generation tasks.
- Keep a record of the command, arguments, `submit_id`, and final status for every paid test you run.
- When the user cares about generation speed, do not default to the `seedance2.0` family unless they explicitly ask for it or clearly prioritize output quality.
- If you are preparing a report, separate:
  - help-only inspection
  - submit-stage validation
  - later async result follow-up
