import { router } from "./init";
import { projectRouter } from "./routers/project";
import { buildingRouter } from "./routers/building";
import { bayRouter } from "./routers/bay";
import { spaceRouter } from "./routers/space";
import { tenantRouter } from "./routers/tenant";
import { leaseRouter } from "./routers/lease";
import { demisingRouter } from "./routers/demising";
import { documentRouter } from "./routers/document";
import { orgRouter } from "./routers/org";
import { shareRouter } from "./routers/share";
import { authRouter } from "./routers/auth";
import { eventRouter } from "./routers/event";
import { metricsRouter } from "./routers/metrics";
import { searchRouter } from "./routers/search";
import { compRouter } from "./routers/comp";

export const appRouter = router({
  auth: authRouter,
  project: projectRouter,
  building: buildingRouter,
  bay: bayRouter,
  space: spaceRouter,
  tenant: tenantRouter,
  lease: leaseRouter,
  demising: demisingRouter,
  document: documentRouter,
  event: eventRouter,
  metrics: metricsRouter,
  org: orgRouter,
  share: shareRouter,
  search: searchRouter,
  comp: compRouter,
});

export type AppRouter = typeof appRouter;
