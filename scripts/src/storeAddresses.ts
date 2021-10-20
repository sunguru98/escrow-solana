import fs from "fs-extra";
import path from "path";
import { KEYPAIRS, KEYS_FOLDER } from "./constants";

(async function () {
  await fs.mkdirp(KEYS_FOLDER);
  Object.entries(KEYPAIRS).map(async ([key, { publicKey, secretKey }]) => {
    await fs.mkdirp(path.resolve(KEYS_FOLDER, key));
    await fs.writeFile(
      path.resolve(KEYS_FOLDER, key, "publicKey.json"),
      JSON.stringify(publicKey.toString())
    );
    await fs.writeFile(
      path.resolve(KEYS_FOLDER, key, "privateKey.json"),
      JSON.stringify(Object.values(secretKey))
    );
  });
})();
