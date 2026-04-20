const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "utm_id", "utm_cid",
  "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid",
  "mc_cid", "mc_eid",
  "msclkid", "twclid", "li_fat_id",
  "_hsenc", "_hsmi", "hsa_cam", "hsa_grp", "hsa_mt", "hsa_src", "hsa_ad", "hsa_acc", "hsa_net", "hsa_ver", "hsa_la", "hsa_ol", "hsa_kw",
  "oly_enc_id", "oly_anon_id",
  "vero_id", "vero_conv",
  "__s", "_openstat",
  "ref", "ref_src", "ref_url",
  "mkt_tok",
  "igshid",
  "s_cid", "s_kwcid",
  "ss_source", "ss_campaign_id",
  "trk", "trkCampaign", "trkInfo",
]);

export function cleanTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    let changed = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key) || key.startsWith("utm_")) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return url;
    const cleaned = parsed.toString();
    return cleaned.endsWith("?") ? cleaned.slice(0, -1) : cleaned;
  } catch {
    return url;
  }
}
