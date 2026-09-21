import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyEventData } from "./test-data.js";
import {
  attachmentError,
  attachmentTypes,
  documentCategories,
  MAX_ATTACHMENT_SIZE,
} from "./attachment-types.js";
import {
  attachmentError as browserError,
  attachmentTypes as browserTypes,
  documentCategories as browserCategories,
} from "../../web/src/lib/attachments.js";
const eventId = "00000000-0000-4000-8000-000000000001";
const attachmentId = "00000000-0000-4000-8000-000000000002";
const tagId = "00000000-0000-4000-8000-000000000003";
test("attachment validation rejects unsafe filenames, mismatched types and oversized files in API and browser", () => {
  assert.deepEqual(attachmentTypes, browserTypes);
  assert.deepEqual(documentCategories, browserCategories);
  for (const validate of [attachmentError, browserError]) {
    for (const [ext, mime] of Object.entries(attachmentTypes))
      assert.equal(validate(`report.${ext}`, MAX_ATTACHMENT_SIZE, mime), null);
    for (const [name, size, mime] of [
      ["x.pdf", 0, "application/pdf"],
      ["x.pdf", MAX_ATTACHMENT_SIZE + 1, "application/pdf"],
      ["../x.pdf", 20, "application/pdf"],
      ["x\\a.pdf", 20, "application/pdf"],
      ["x\n.pdf", 20, "application/pdf"],
      ["x.svg", 20, "image/svg+xml"],
      ["x.jpg", 20, "application/pdf"],
      ["x.exe", 20, "application/octet-stream"],
    ] as const)
      assert.ok(validate(name, size, mime));
  }
});
test("attachment routes authenticate, validate ownership and scope deletion to the event", async () => {
  let writes = 0,
    links = 0;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) =>
      token === "good"
        ? { id: "owner" }
        : token === "other"
          ? { id: "other" }
          : null,
    dataForToken: (token) => ({
      ...emptyEventData,
      isApproved: async () => true,
      listProfiles: async () => [],
      getEvent: async (id) =>
        token === "good" && id === eventId ? ({ id } as never) : null,
      listAttachments: async () => [],
      createAttachment: async (id, owner, input) => {
        writes++;
        assert.equal(id, eventId);
        assert.equal(owner, "owner");
        assert.equal(input.document_category, "lab result");
        assert.equal(input.description, "Annual blood work");
        assert.equal(input.provider_id, tagId);
        assert.deepEqual(input.tag_ids, [tagId]);
        return {
          id: attachmentId,
          health_event_id: id,
          file_path: "private",
          created_at: "now",
          ...input,
        };
      },
      linkAttachment: async (id, document) => {
        links++;
        assert.equal(id, eventId);
        if (document !== attachmentId) return null;
        return {
          id: attachmentId,
          health_event_id: "source-event",
          file_name: "existing.pdf",
          file_path: "private/existing",
          mime_type: "application/pdf",
          file_size: 100,
          document_category: "lab result",
          description: null,
          created_at: "now",
        };
      },
      deleteAttachment: async (id, attachment) => {
        assert.equal(id, eventId);
        return attachment === attachmentId;
      },
    }),
  });
  const base = `/api/v1/events/${eventId}/attachments`;
  for (const method of ["get", "post", "delete"] as const)
    await request(app)
      [method](method === "delete" ? `${base}/${attachmentId}` : base)
      .expect(401);
  await request(app)
    .post(`${base}/link`)
    .send({ document_id: attachmentId })
    .expect(401);
  await request(app).get(base).set("Authorization", "Bearer other").expect(404);
  await request(app)
    .post(base)
    .set("Authorization", "Bearer good")
    .send({ file_name: "x.pdf", mime_type: "image/jpeg", file_size: 100 })
    .expect(400);
  await request(app)
    .post(base)
    .set("Authorization", "Bearer good")
    .send({
      file_name: "x.pdf",
      mime_type: "application/pdf",
      file_size: 100,
      owner_id: "other",
    })
    .expect(400);
  assert.equal(writes, 0);
  await request(app)
    .post(base)
    .set("Authorization", "Bearer good")
    .send({
      file_name: "x.pdf",
      mime_type: "application/pdf",
      file_size: 100,
      document_category: "lab result",
      description: "Annual blood work",
      provider_id: tagId,
      tag_ids: [tagId],
    })
    .expect(201);
  await request(app)
    .post(`${base}/link`)
    .set("Authorization", "Bearer good")
    .send({ document_id: attachmentId })
    .expect(201);
  await request(app)
    .post(`${base}/link`)
    .set("Authorization", "Bearer good")
    .send({ document_id: "not-a-document" })
    .expect(400);
  assert.equal(links, 1);
  await request(app)
    .post(base)
    .set("Authorization", "Bearer good")
    .send({
      file_name: "x.pdf",
      mime_type: "application/pdf",
      file_size: 100,
      document_category: "not-medical",
    })
    .expect(400);
  await request(app)
    .get(base)
    .set("Authorization", "Bearer good")
    .expect(200)
    .expect("Cache-Control", "no-store");
  await request(app)
    .delete(`${base}/${attachmentId}`)
    .set("Authorization", "Bearer good")
    .expect(204);
  await request(app)
    .delete(`${base}/${eventId}`)
    .set("Authorization", "Bearer good")
    .expect(404);
});

test("Storage failure keeps metadata and event; retries delete object before metadata", async () => {
  const { createServer } = await import("node:http");
  const { createUserDataAccess } = await import("./data.js");
  const calls: string[] = [];
  let failStorage = true;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer verified-user");
    const url = new URL(req.url!, "http://localhost");
    calls.push(`${req.method} ${url.pathname}`);
    res.setHeader("Content-Type", "application/json");
    if (url.pathname.startsWith("/storage/")) {
      if (failStorage) {
        res.statusCode = 503;
        res.end(JSON.stringify({ message: "Unavailable" }));
      } else res.end("[]");
    } else if (req.method === "DELETE") {
      res.end(
        url.pathname.endsWith("/health_events")
          ? JSON.stringify([{ id: eventId }])
          : "[]",
      );
    } else if (url.searchParams.get("select") === "id")
      res.end(JSON.stringify([{ id: attachmentId }]));
    else
      res.end(
        JSON.stringify([{ id: attachmentId, file_path: "private/path" }]),
      );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const data = createUserDataAccess(
      `http://127.0.0.1:${address.port}`,
      "public-key",
      "verified-user",
    );
    await assert.rejects(
      data.deleteEvent(eventId),
      /Unable to delete the file/,
    );
    assert.equal(
      calls.some(
        (call) =>
          call === "DELETE /rest/v1/attachments" ||
          call === "DELETE /rest/v1/health_events",
      ),
      false,
    );
    failStorage = false;
    calls.length = 0;
    assert.equal(await data.deleteEvent(eventId), true);
    assert.deepEqual(
      calls.filter((call) => call.startsWith("DELETE")),
      [
        "DELETE /storage/v1/object/health-attachments",
        "DELETE /rest/v1/attachments",
        "DELETE /rest/v1/health_events",
      ],
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
