import { router } from "./init";
import { projectRouter } from "./routers/project";
import { buildingRouter } from "./routers/building";
import { bayRouter } from "./routers/bay";
import { spaceRouter } from "./routers/space";
import { tenantRouter } from "./routers/tenant";
import { leaseRouter } from "./routers/lease";
import { demisingRouter } from "./routers/demising";

export const appRouter = router({
  project: projectRouter,
  building: buildingRouter,
  bay: bayRouter,
  space: spaceRouter,
  tenant: tenantRouter,
  lease: leaseRouter,
  demising: demisingRouter,
});

export type AppRouter = typeof appRouter;
