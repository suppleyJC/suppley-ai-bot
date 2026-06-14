import { router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { authRouter } from "./routers/authRouter";
import { exchangeRouter } from "./routers/exchangeRouter";
import { industriesRouter } from "./routers/industriesRouter";
import { suppliersRouter } from "./routers/suppliersRouter";
import { productsRouter } from "./routers/productsRouter";
import { ncmRouter } from "./routers/ncmRouter";
import { icmsRouter } from "./routers/icmsRouter";
import { calculationsRouter } from "./routers/calculationsRouter";
import { quotationsRouter } from "./routers/quotationsRouter";
import { settingsRouter } from "./routers/settingsRouter";
import { agentRouter } from "./routers/agentRouter";
import { excambiaRouter } from "./routers/excambiaRouter";
import { portsRouter } from "./routers/portsRouter";
import { drawbackRouter } from "./routers/drawbackRouter";
import { taxNotificationsRouter } from "./routers/taxNotificationsRouter";
import { statePricingRouter } from "./routers/statePricingRouter";
import { commoditiesRouter } from "./routers/commoditiesRouter";
import { taxTablesRouter } from "./routers/taxTablesRouter";
import { marketDataRouter } from "./routers/marketDataRouter";
import { priceComparisonRouter } from "./routers/priceComparisonRouter";
import { reformRouter } from "./routers/reformRouter";
import { rfqRouter } from "./routers/rfqRouter";
import { messagingRouter } from "./routers/messagingRouter";
// Motor V2 Integration
import { estimativaRouter } from "./routers/estimativaRouter";
import { operationsRouter } from "./routers/operationsRouter";
import { marketRouter } from "./routers/marketRouter";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  exchange: exchangeRouter,
  industries: industriesRouter,
  suppliers: suppliersRouter,
  products: productsRouter,
  ncm: ncmRouter,
  icms: icmsRouter,
  calculations: calculationsRouter,
  quotations: quotationsRouter,
  settings: settingsRouter,
  agent: agentRouter,
  excambia: excambiaRouter,
  ports: portsRouter,
  drawback: drawbackRouter,
  taxNotifications: taxNotificationsRouter,
  statePricing: statePricingRouter,
  commodities: commoditiesRouter,
  taxTables: taxTablesRouter,
  marketData: marketDataRouter,
  priceComparison: priceComparisonRouter,
  reform: reformRouter,
  rfq: rfqRouter,
  messaging: messagingRouter,
  // Motor V2 endpoints (paralelos ao sistema existente)
  estimativa: estimativaRouter,
  operations: operationsRouter,
  market: marketRouter,
});

export type AppRouter = typeof appRouter;
