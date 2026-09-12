import { test } from "node:test";
import assert from "node:assert/strict";
import { eventInputSchema } from "./events.js";
import {
  eventDraft,
  draftInput,
  validateDraft,
  type HealthEvent,
} from "../../web/src/lib/events.js";
const profile = "00000000-0000-4000-8000-000000000001";
test("vaccinations preserve manually entered disease and next-dose date without inferring dates", () => {
  const input = {
    profile_id: profile,
    event_type: "Vaccination",
    title: "Test vaccine",
    disease: "Test disease",
    event_date: "2026-06-01T12:00:00Z",
    next_dose_date: "2030-01-15",
  };
  const parsed = eventInputSchema.parse(input);
  assert.equal(parsed.next_dose_date, "2030-01-15");
  const draft = eventDraft({
    ...parsed,
    id: profile,
    created_at: input.event_date,
    updated_at: input.event_date,
  } as HealthEvent);
  assert.equal(draftInput(draft).next_dose_date, "2030-01-15");
  assert.equal(draftInput(draft).disease, "Test disease");
  assert.equal(
    eventInputSchema.parse({ ...input, next_dose_date: undefined })
      .next_dose_date,
    null,
  );
  assert.equal(
    eventInputSchema.safeParse({ ...input, next_dose_date: "2030-02-31" })
      .success,
    false,
  );
  assert.ok(
    validateDraft({ ...draft, next_dose_date: "bad" }, [profile])
      .next_dose_date,
  );
});
