import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Keep the existing Playwright-compatible API, but use the driver verified
// against the recruiting sites. Falling back to the old driver reintroduces
// their script-triggered about:blank navigation.
export function playwright(){
  try{return require('patchright-core');}
  catch(error){
    if(error.code!=='MODULE_NOT_FOUND')throw error;
    throw Error('缺少浏览器驱动。请使用完整安装包，或在工具目录执行 npm ci');
  }
}
