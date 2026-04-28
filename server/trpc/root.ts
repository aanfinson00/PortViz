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
import { searchRouter } from "./routers/search";

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
  org: orgRouter,
  share: shareRouter,
  search: searchRouter,
});

export type AppRouter = typeof appRouter;
