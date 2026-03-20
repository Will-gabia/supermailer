cat << 'PATCH' > route.patch
--- apps/management-console/src/server/routes/delivery-events.ts
+++ apps/management-console/src/server/routes/delivery-events.ts
@@ -138,7 +138,17 @@
       }
 
+      const events = await getSendEventHistory(appContext, sendId);
+      const webhookDelivery = await appContext.repositories.outboundWebhookDeliveries.findBySendId(sendId);
+
       return context.json({
-        data: await getSendEventHistory(appContext, sendId),
+        data: events,
+        webhookDelivery: webhookDelivery ? {
+          status: webhookDelivery.status,
+          targetUrl: webhookDelivery.targetUrl,
+          attemptCount: webhookDelivery.attemptCount,
+          lastAttemptAt: webhookDelivery.lastAttemptAt,
+          nextAttemptAt: webhookDelivery.nextAttemptAt,
+        } : null,
       });
     },
   );
PATCH
patch apps/management-console/src/server/routes/delivery-events.ts < route.patch
