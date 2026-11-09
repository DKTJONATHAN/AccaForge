import React from "react";
import { hydrateRoot } from "react-dom/client";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import type { AccasResponse } from "./types";
import "./index.css";

const client=new QueryClient({defaultOptions:{queries:{staleTime:60000,refetchOnWindowFocus:false,refetchInterval:300000,retry:1}}});
let initialData:AccasResponse|undefined;
try {
 const payload=document.getElementById("accaforge-ssr-data")?.textContent;
 if(payload)initialData=JSON.parse(payload) as AccasResponse;
} catch(error) {
 console.error("Could not read the server-rendered AccaForge data.",error);
}
const root=document.getElementById("root");
if(root)hydrateRoot(root,<React.StrictMode><QueryClientProvider client={client}><App initialData={initialData}/></QueryClientProvider></React.StrictMode>);
