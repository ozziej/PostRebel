export interface SplitSecretsResult {
  public: any;
  secrets: any;
}

/**
 * Splits secret-marked values (environment `variablesArray` secrets, and
 * request `body.formData` secrets) out of a Collection/Environment payload
 * before it's written to a git-tracked JSON file. The redacted values are
 * returned separately as `secrets`, which callers persist as a sibling
 * `<name>.secrets.json` file (gitignored).
 */
export function splitSecrets(data: any): SplitSecretsResult {
  const publicData = JSON.parse(JSON.stringify(data)); // deep clone
  const secrets: any = {};

  // Handle environment/collection variables. Secrets are redacted from both
  // variablesArray AND the legacy flat `variables` map — leaving a secret's
  // real value in `variables` would defeat the redaction entirely, since
  // that flat map is written to the same git-tracked file.
  if (data.variablesArray) {
    publicData.variablesArray = [];
    secrets.variables = {};

    data.variablesArray.forEach((v: any) => {
      if (v.isSecret) {
        secrets.variables[v.key] = v.value;
        publicData.variablesArray.push({ key: v.key, value: '', isSecret: true });
        if (publicData.variables) publicData.variables[v.key] = '';
      } else {
        publicData.variablesArray.push(v);
      }
    });
  }

  // Handle form data secrets in requests, including requests nested inside
  // folders at any depth. This redacts on the cloned `publicData`, not the
  // original `data` — mutating `data` here would leave `publicData` (the
  // object written to the git-tracked file) holding the unredacted secret
  // value, since it was already deep-cloned above.
  if (publicData.requests || publicData.folders) {
    secrets.requests = {};
    const allRequests: any[] = [...(publicData.requests || [])];
    collectFolderRequests(publicData.folders, allRequests);

    allRequests.forEach((req: any) => {
      if (req.body?.formData) {
        const secretParams: any = {};
        req.body.formData = req.body.formData.map((param: any) => {
          if (param.isSecret) {
            secretParams[param.key] = param.value;
            return { ...param, value: '' };
          }
          return param;
        });
        if (Object.keys(secretParams).length > 0) {
          secrets.requests[req.id] = { formData: secretParams };
        }
      }
    });
  }

  return { public: publicData, secrets };
}

// Collects every request from a folder tree, at any depth, into `out` — the
// same object references nested inside `folders`, so mutating an entry in
// `out` mutates the tree in place.
function collectFolderRequests(folders: any[] | undefined, out: any[]): void {
  for (const folder of folders || []) {
    out.push(...(folder.requests || []));
    collectFolderRequests(folder.folders, out);
  }
}
