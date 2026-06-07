export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const payload = {
      ...req.body,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(
      "https://script.google.com/macros/s/AKfycbzefLaXxpbfrBzNSyxUwcan46hHK4WdlBdH7YX6X9KDayOhNJUvYV--uCy_bO-JyTpF/exec",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    return res.status(200).json(data);

  } catch (err) {
    console.error('Logging error:', err)
    return res.status(500).json({ error: err.message })
  }
}
