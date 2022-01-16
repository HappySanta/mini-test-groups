import VkBot from "node-vk-bot-api";


const API_VERSION = '5.161'

export class VkApi {

  constructor(token, onTokenLost) {
    this.token = token;
    this.onTokenLost = onTokenLost;
  }

  async api(method, params) {
    const vk = new VkBot('x');

    try {
      const r =  await vk.api(method, {
        v: API_VERSION,
        access_token: this.token,
        ...params
      });
      return r.response;
    } catch (e) {
      const code = e?.response?.error_code
      if (code === 5) {
        if (this.onTokenLost) {
          this.onTokenLost(e);
        }
      }
      throw e;
    }
  }

  /**
   *
   * @return {Promise<{app_id:number,name:string,group_id:number}[]>}
   */
  async status() {
    return this.api('apps.getTestingGroups', {});
  }

  /**
   * @param webView
   * @param name
   * @param {number|undefined} groupId
   * @return {Promise<{group_id:number}>}
   */
  async update(webView, name, groupId) {
    return this.api('apps.updateMetaForTestingGroup', {
      webview: webView,
      name: name,
      platform: 31,
      group_id:groupId,
    })
  }
}
