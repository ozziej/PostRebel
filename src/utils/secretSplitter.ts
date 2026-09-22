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

  // Handle environment variables
  if (data.variablesArray) {
    publicData.variablesArray = [];
    secrets.variables = {};

    data.variablesArray.forEach((v: any) => {
      if (v.isSecret) {
        secrets.variables[v.key] = v.value;
        publicData.variablesArray.push({ key: v.key, value: '', isSecret: true });
      } else {
        publicData.variablesArray.push(v);
      }
    });
  }

  // Handle form data secrets in requests. This redacts on the cloned
  // `publicData`, not the original `data` — mutating `data` here would leave
  // `publicData` (the object written to the git-tracked file) holding the
  // unredacted secret value, since it was already deep-cloned above.
  if (publicData.requests) {
    secrets.requests = {};
    publicData.requests.forEach((req: any) => {
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
