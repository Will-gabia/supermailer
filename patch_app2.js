const fs = require('fs');
let content = fs.readFileSync('apps/management-console/src/client/App.tsx', 'utf-8');
content = content.replace(
  `    } catch {
    }
  };`,
  `    } catch (e) {
      console.error(e);
    }
  };`
);
fs.writeFileSync('apps/management-console/src/client/App.tsx', content);
