# Deploy ShopCompare backend to Render

Recommended Render settings:
- Runtime: Node
- Build command: npm install
- Start command: npm start
- Health check: /api/health

After deployment, test:
https://YOUR-SERVICE.onrender.com/api/health

Expected response:
{"ok":true,"service":"shopcompare-api","demoMode":true}

Important:
- Do not put API keys or affiliate secrets in GitHub or frontend JavaScript.
- Add real retailer credentials later as private environment variables/secrets.
- The free Render web-service plan is suitable for testing/hobby use and can
  spin down after inactivity.
