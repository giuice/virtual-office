// Single collection authority for the normative concurrency lane. Importing
// every tagged suite into one Vitest file prevents cross-file overlap around
// the intentionally global PMO membership and immutable-audit fixtures.
import "../exit-gate-races.test";
import "../write-gate.test";
import "../phase6-cutover-audit.test";
import "../presence-concurrency-contract.test";
import "./normative-races.test";
