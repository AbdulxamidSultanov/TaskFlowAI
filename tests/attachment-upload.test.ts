import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttachmentProof, verifyAttachmentProof, MAX_ATTACHMENT_BYTES } from "../src/lib/attachment-upload-proof";

test("direct uploads bind file, task, user, expiry and signature", () => {
    process.env.AUTH_SECRET = "upload-test-secret-32-characters-minimum";
    const { proof, token } = createAttachmentProof("u1", "t1", { name: "../notes.txt", size: MAX_ATTACHMENT_BYTES });
    assert.equal(verifyAttachmentProof(token, "u1", "t1").id, proof.id);
    assert.ok(!proof.name.includes("/"));
    assert.equal(proof.size, MAX_ATTACHMENT_BYTES);
    assert.throws(() => verifyAttachmentProof(token, "u2", "t1"), { code: "UPLOAD_AUTH" });
    assert.throws(() => verifyAttachmentProof(token, "u1", "t2"), { code: "UPLOAD_AUTH" });
    assert.throws(() => verifyAttachmentProof(token + "x", "u1", "t1"), { code: "UPLOAD_AUTH" });
    const now = Date.now;
    try {
        Date.now = () => proof.expiresAt + 1;
        assert.throws(() => verifyAttachmentProof(token, "u1", "t1"), { code: "UPLOAD_AUTH" });
    } finally { Date.now = now; }
    assert.throws(() => createAttachmentProof("u1", "t1", { name: "big", size: MAX_ATTACHMENT_BYTES + 1 }));
    assert.throws(() => createAttachmentProof("u1", "t1", { name: "empty", size: 0 }));
});
