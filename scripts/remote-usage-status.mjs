import { remoteUsageStatus } from "../server/lib/remote-admission.mjs";

console.log(JSON.stringify(await remoteUsageStatus(), null, 2));
