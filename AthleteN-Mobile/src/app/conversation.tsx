import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ConversationRedirect(){
 const {id}=useLocalSearchParams<{id?:string}>();
 if(!id)return <Redirect href="/messages" />;
 return <Redirect href={{pathname:'/messages',params:{conversationId:String(id)}}} />;
}
