# Agent Note: Wire-compatibility switches on the Models page

Status: implemented

English | [中文](2026-09-21-models-page-wire-compat-switches.zh.md)

## Problem

`dsh-llm-pi-ai` exposes a compat surface a hand-declared gateway has to state for itself, because pi-ai's baseURL detection answers as though an unrecognized endpoint were OpenAI itself. `settings.yaml` was the only place to set those switches: a gateway created through the Models page could be saved but never corrected from the UI, and the adapter's refusal names a compat field the page offered no control for.

Adding such a control is not a matter of rendering one more input. The settings plane does not reject a key the adapter's `Config` never declared: schemastery resolves with `strict = false`, and the object branch merges unknown keys through. A control for an undeclared field therefore writes successfully, returns from the next describe, renders its stored value back — and changes no request. That is the one failure this page exists to avoid, and it is invisible from the browser.

A second constraint shapes the control. The adapter refuses a switch the model's protocol does not declare, and that refusal fails the whole profile write, not the one field.

## Decision

### The adapter's own schema decides which switches exist

`compatFieldsByProtocol(namespace, schema)` (in [`src/client/store.ts`](../../../../packages/client/ui-settings-models/src/client/store.ts)) reads the namespace's serialized `Config` and returns the switches the page may edit, keyed by wire protocol. A switch becomes a control only where both gates pass: the protocol is in the page's own `COMPAT_PAGE_FIELDS` table, and the adapter schema declares the field at `providers.<route>.compat.<field>`. The page calls this once per render of the section and passes the map to every card, so the create card, the saved row, and the onboarding dialog cannot drift apart.

Enum options are read from the field's serialized `union` list, which keeps the page from offering a value the adapter refuses. An enum the schema cannot enumerate is dropped rather than free-texted, for the same reason.

### A route's protocol must be provable

The switches are per model, so the page has to know which protocol that model speaks. It can prove the answer only when the route states `api` itself: every hand-declared route does, and a catalog route does not, because each of its models carries the protocol its installed catalog entry names and nothing the browser reads exposes that. A catalog route therefore gets no switch control at all. Guessing would convert one wrong pick into a rejected whole-profile write, and the page cannot tell which model was at fault.

### A boolean switch is tri-state

`true`, `false`, and unset are three distinct requests: unset leaves the field to the layer beneath the profile — the installed catalog entry, then pi-ai's own detection. The control is a three-option select (provider default / yes / no), not a checkbox, and clearing the last switch of a model drops the `compat` object instead of storing `{}`, which the row would render as configured while the adapter reads nothing stated.

## Alternatives considered

**A request-`headers` editor on the card.** Built, then removed before landing. Three independent records hold that profile `headers` is deliberately not a Models-page field: the [`dsh-llm-pi-ai` README](../../../../packages/llm/llm-pi-ai/README.md) has deployment headers reaching discovery "without becoming discovery-request or Models-page fields", the [`dsh-client-ui-settings-models` README](../../../../packages/client/ui-settings-models/README.md) states it has no such editor, and [draft provider endpoint interrogation](../../implemented/architecture/2026-08-04-draft-provider-endpoint-interrogation.md) keeps it a Host-side exception. Implementing it also surfaced a defect the records predict: **Fetch available models** sends the *stored* headers, so an edited-but-unsaved header would be silently ignored — the same "form shows X, request uses Y" failure that note uses to reject reading the whole stored profile. A header value is also a plain string dict the redactor does not strip, so the editor would invite a credential into a field the page then returns in plaintext. Revisiting this needs a decision about redaction and about threading drafted headers into discovery, not an editor.

**A schema-driven generic form.** Rejected: the editor is hand-written for its layout, and rendering every declared field would surface retry policy, image budgets, and timeouts as raw controls with no product copy. The curated set is the trade the package already records.

**Provider-level compat instead of model-level.** Deferred, not rejected: a route-level default is the adapter's own first-class field and is the cheaper control when a route's models share one protocol. This change ships the model-level control only.

**Free-text enum values.** Rejected: the page would offer a value the adapter then refuses, and it would refuse the whole profile rather than the field.

## Testing

[`tests/provider-form.client.spec.tsx`](../../../../packages/client/ui-settings-models/tests/provider-form.client.spec.tsx) pins the schema read directly — enum values and page order, a switch the schema does not declare, an enum of non-const schemas, a missing namespace, and a namespace with no profile schema — and drives the rendered control through the section: a boolean and two enums written together, a switch set back to the provider default, a model whose last switch is cleared, the Responses protocols receiving their own switches, a catalog route and an unsupported protocol receiving none, and a sibling row carried through untouched. `tests/components.client.spec.tsx` renders the editor directly for the non-pi-ai namespace. `tests/styles.client.spec.ts` keeps the new classes on declared theme tokens. The package runs under the per-file 100% coverage gate.

## Consequences

A gateway can now be corrected from the page it was created on, and the correction takes effect on the next request because settings are re-read per operation. The page cannot write a compatibility key the adapter would not read, and it cannot offer a value the adapter would refuse — both properties are enforced by reading the adapter's schema rather than restating it.

What it costs: a catalog route still cannot be given a model-level switch, because the browser has no way to learn which protocol its catalog entry names; that route can still be corrected in `settings.yaml`, and a route that states `api` is unaffected. The page also now depends on the shape of the serialized `compat` object, so a schema that renames or nests those fields removes the controls rather than mis-writing them — the failure is a missing control, which is the direction the page prefers.
