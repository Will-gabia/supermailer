import sys

content = open('apps/management-console/src/client/App.tsx').read()

old_filtered = """  // Filtered Subscribers
  const filteredSubscribers = subscribers.filter((s) => {
    if (subscriberTab === 'all') return true;
    if (subscriberTab === 'eligible') return s.eligible && !s.isUnsubscribed;
    if (subscriberTab === 'unsubscribed') return s.isUnsubscribed;
    if (subscriberTab === 'suppressed') return s.suppressionReasons.length > 0;
    return true;
  });"""

new_filtered = """  // Filtered Subscribers
  const filteredSubscribers = subscribers.filter((s) => {
    if (!selectedGroupId) return true;
    return s.groups.some(g => g.id === selectedGroupId);
  });"""

content = content.replace(old_filtered, new_filtered)

with open('apps/management-console/src/client/App.tsx', 'w') as f:
    f.write(content)
