import React from "react";
import { hydrateRoot } from "react-dom/client";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import type { AccasResponse } from "./types";
import type { TrackRecordPayload } from "./App";
import type { SiteContent } from "./App";
import "./index.css";

const client=new QueryClient({defaultOptions:{queries:{staleTime:60000,refetchOnWindowFocus:false,refetchInterval:300000,retry:1}}});
let initialData:AccasResponse|undefined;
let todayLabel:string|undefined;
let pathname:string|undefined;
let initialContent:SiteContent|undefined;
let initialTrackRecord:TrackRecordPayload|undefined;
try {
 const payload=document.getElementById("accaforge-ssr-data")?.textContent;
 if(payload){const parsed=JSON.parse(payload) as {initialData:AccasResponse;initialContent:SiteContent;initialTrackRecord?:TrackRecordPayload;todayLabel:string;pathname:string};initialData=parsed.initialData;initialContent=parsed.initialContent;initialTrackRecord=parsed.initialTrackRecord;todayLabel=parsed.todayLabel;pathname=parsed.pathname;}
} catch(error) {
 console.error("Could not read the server-rendered AccaForge data.",error);
}
const root=document.getElementById("root");
if(root)hydrateRoot(root,<React.StrictMode><QueryClientProvider client={client}><App initialData={initialData} initialContent={initialContent} initialTrackRecord={initialTrackRecord} todayLabel={todayLabel} pathname={pathname}/></QueryClientProvider></React.StrictMode>);
