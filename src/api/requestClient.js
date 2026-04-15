const buildUrl = (baseUrl, path) => {
  const slashBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
  const slashPath = path.startsWith('/') ? path : `/${path}`;
  return `${slashBase}${slashPath}`;
};

class RequestClient {
  constructor({ baseUrl, fetch }) {
    this.baseUrl = baseUrl;
    const fetchImpl = fetch || globalThis.fetch;
    this.fetch = fetchImpl ? fetchImpl.bind(globalThis) : null;
  }

  async get(path, { headers } = {}) {
    if (!this.fetch) {
      throw new Error('Fetch is not available');
    }
    const response = await this.fetch(buildUrl(this.baseUrl, path), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    });
    const payload = await response.json();
    return { response, payload };
  }

  async post(path, { body, headers } = {}) {
    if (!this.fetch) {
      throw new Error('Fetch is not available');
    }
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
