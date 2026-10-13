/** @format */
import helmet from "helmet";

export default helmet({
 contentSecurityPolicy: {
  directives: {
   defaultSrc: ["'self'"],
   scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
   styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
   imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
   connectSrc: ["'self'"],
   upgradeInsecureRequests: null,
  },
 },
});
