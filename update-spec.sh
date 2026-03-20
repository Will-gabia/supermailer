sed -i.bak "s/'individual — alice@example.com — queued — send-'/'alice@example.com (individual) — queued — send-'/g" e2e/send-flows.spec.ts
sed -i.bak "s/\`campaign — \${campaignRecipient} — queued — send-\`/\`\${campaignRecipient} (campaign) — queued — send-\`/g" e2e/send-flows.spec.ts
