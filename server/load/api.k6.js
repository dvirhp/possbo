import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    steady: { executor: "ramping-arrival-rate", startRate: 5, timeUnit: "1s", preAllocatedVUs: 20, maxVUs: 100, stages: [{ target: 25, duration: "1m" }, { target: 50, duration: "2m" }, { target: 0, duration: "30s" }] },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    checks: ["rate>0.99"],
  },
};

const baseUrl = __ENV.BASE_URL || "http://localhost:8000";
export default function () {
  const response = http.get(`${baseUrl}/health/ready`);
  check(response, { "ready is 200": (r) => r.status === 200 });
}
