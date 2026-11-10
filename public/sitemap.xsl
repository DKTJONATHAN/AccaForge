<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html lang="en"><head><title>AccaForge — XML Sitemap</title><meta name="viewport" content="width=device-width, initial-scale=1"/><style>body{font:16px system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 18px;color:#202124}h1{color:#087b4a}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}a{color:#087b4a;overflow-wrap:anywhere}p{color:#465568}</style></head><body><h1>AccaForge — Sitemap</h1><p>Public pages available for discovery and indexing.</p><table><thead><tr><th>Page URL</th><th>Priority</th></tr></thead><tbody><xsl:for-each select="s:urlset/s:url"><tr><td><a><xsl:attribute name="href"><xsl:value-of select="s:loc"/></xsl:attribute><xsl:value-of select="s:loc"/></a></td><td><xsl:value-of select="s:priority"/></td></tr></xsl:for-each></tbody></table></body></html>
</xsl:template></xsl:stylesheet>
