import {supabase} from './supabase';

export async function emitShopFactoryEvent(source:'umbra_copy'|'umbra_videos'|'umbra_editor'|'umbra_clip_shop',eventId:string,data:Record<string,unknown>):Promise<void>{
  const{data:session}=await supabase.auth.getSession();const token=session.session?.access_token;if(!token)return;
  await fetch('/api/intelligence',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({action:'shop-factory-emit',params:{source,eventId,data}})}).catch(()=>undefined);
}
