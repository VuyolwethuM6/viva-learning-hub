import type { Plugin } from "vite";
/** Check before Vite's transforms/static handlers, including raw/query URL variants. */
export function protectDevelopmentFiles(): Plugin {
  return {
    name: "viva-protect-development-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let target = req.url || "";
        try {
          for (let i = 0; i < 4; i++) {
            const decoded = decodeURIComponent(target);
            if (decoded === target) break;
            target = decoded;
          }
        } catch {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        target = target.replace(/\\/g, "/");
        if (
          target.includes("\0") ||
          /(^|\/)\.(?:env(?:[./?]|$)|git(?:[/?]|$))|(^|\/)private(?:[/?]|$)|\.(?:crt|pem|key)(?:[?/#]|$)/i.test(
            target,
          )
        ) {
          res.statusCode = 403;
          res.setHeader("Cache-Control", "no-store");
          res.end("Forbidden");
          return;
        }
        next();
      });
    },
  };
}
