import { executeRound } from "../apps/engine/src/scheduler.js";

executeRound()
  .then(() => {
    console.log("Round executed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Round failed:", err);
    process.exit(1);
  });
