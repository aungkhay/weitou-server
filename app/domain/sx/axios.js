const axios = require('axios');

class HttpRequest {
  constructor(baseURL, timeout = 10000) {
    this.instance = axios.create({
      baseURL: baseURL,
      timeout: timeout,
      headers: {
        'Content-Type': 'application/json', // Common default header
      },
      // You can add other Axios configuration options here, such as:
      // withCredentials: true, // For sending cookies with cross-origin requests
      // transformRequest: [(data, headers) => { /* ... */ }], // For transforming request data
      // transformResponse: [(data, headers) => { /* ... */ }], // For transforming response data
    });

    // You can also add request and response interceptors here
    this.instance.interceptors.request.use(
      (config) => {
        config.headers['Authorization'] = `Bearer {{token}}`;
        config.headers['clientId'] = 'e5cd7e4891bf95d1d19206ce24a7b32e';
        config.headers['tenantId'] = '857453';
        return config;
      },
      (error) => {
        // Do something with request error
        return Promise.reject(error);
      }
    );

    this.instance.interceptors.response.use(
      (response) => {
        // Any status code that lie within the range of 2xx cause this function to trigger
        // Do something with response data
        return response;
      },
      (error) => {
        // Any status codes that falls outside the range of 2xx cause this function to trigger
        // Do something with response error
        // For example, handle specific error codes
        // if (error.response.status === 401) { /* ... */ }
        return Promise.reject(error);
      }
    );
  }

  // Example methods for making requests
  get(url, config) {
    return this.instance.get(url, config);
  }

  post(url, data, config) {
    return this.instance.post(url, data, config);
  }

  put(url, data, config) {
    return this.instance.put(url, data, config);
  }

  delete(url, config) {
    return this.instance.delete(url, config);
  }
}
// 默认导出一个实例，可以根据需要创建多个实例
module.exports = (baseURL, timeout) => new HttpRequest(baseURL, timeout);