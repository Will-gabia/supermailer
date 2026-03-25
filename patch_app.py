import sys

content = open('apps/management-console/src/client/App.tsx').read()
content = content.replace("import {\n  SubscriberTab,\n  buildSubscriberFiltersSearch,\n  parseSubscriberFiltersFromSearch,\n} from './subscriberFiltersQuery';", "import {\n  buildSubscriberFiltersSearch,\n  parseSubscriberFiltersFromSearch,\n} from './subscriberFiltersQuery';")

content = content.replace("const [subscriberTab, setSubscriberTab] = useState<SubscriberTab>(\n    initialSubscriberFilterState.tab,\n  );", "const [selectedGroupId, setSelectedGroupId] = useState<string | null>(\n    initialSubscriberFilterState.groupId,\n  );")

content = content.replace("const nextSearch = buildSubscriberFiltersSearch({ tab: subscriberTab });", "const nextSearch = buildSubscriberFiltersSearch({ groupId: selectedGroupId });")

content = content.replace("}, [locationSearch, pathname, subscriberTab]);", "}, [locationSearch, pathname, selectedGroupId]);")

content = content.replace("link.download = `subscribers-${subscriberTab}.csv`;", "link.download = `subscribers-${selectedGroupId || 'all'}.csv`;")


with open('apps/management-console/src/client/App.tsx', 'w') as f:
    f.write(content)
