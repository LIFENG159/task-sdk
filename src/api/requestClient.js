const buildUrl = (baseUrl, path) => {
  const slashBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
  const slashPath = path.startsWith('/') ? path : `/${path}`;
  return `${slashBase}${slashPath}`;
};

class RequestClient {
  constructor({ baseUrl, fetch }) {
    this.baseUrl = baseUrl;
    this.fetch = fetch || globalThis.fetch;
  }

  async get(path, { headers } = {}) {
    const response = await this.fetch(buildUrl(this.baseUrl, path), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    });
    const payload = await response.json();
    return { response, payload };
  }

  async post(path, { body, headers } = {}) {
    const response = await this.fetch(buildUrl(this.baseUrl, path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    return { response, payload };
  }
}

module.exports = RequestClient;
