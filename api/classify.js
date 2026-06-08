// Scop'd v2 — capability-first architecture

function buildResponse(role, candidate, fit) {
  if (!fit) {
    return {
      role_label: role.title || 'Role Analysis',
      verdict: null,
      why: [
        `This is a ${role.context?.industry || 'general'} role focused on ${(role.responsibilities || []).slice(0, 2).join(' and ').toLowerCase()}.`
      ],
      strengths: role.skills || [],
      gaps: [],
      decision_reasons: role.expectations || [],
      risk: null,
      career_impact: [],
      screening_priorities: [],
      hidden_expectations: role.expectations || [],
      role,
      candidate: null,
      fit: null
    };
  }

  const capFit = fit.capability_fit || {};
  const verdictMap = { strong: 'Apply confidently', moderate: 'Apply with caution', weak: 'Do not apply' };

  return {
    role_label: role.title || 'Role Analysis',
    verdict: verdictMap[capFit.verdict] || 'Review carefully',
    why: [
      `This is a ${role.context?.industry || 'general'} role focused on ${(role.responsibilities || []).slice(0, 2).join(' and ').toLowerCase()}.`,
      capFit.summary || '',
    ].filter(Boolean),
    strengths: capFit.matched || [],
    gaps: capFit.gaps || [],
    decision_reasons: fit.screening_priorities || [],
    risk: fit.risk || null,
    career_impact: fit.career_impact || {},
    screening_priorities: fit.screening_priorities || [],
    hidden_expectations: fit.hidden_expectations || [],
    role,
    candidate,
    fit
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jd, cvText, goals } = req.body;
  if (!jd) return res.status(400).json({ error: 'No job description provided.' });

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

    const role = await extractRole(client, jd);
    const candidate = cvText ? await extractCandidate(client, cvText) : null;
    const fit = candidate ? await evaluateFit(client, role, candidate, goals || null) : null;

    return res.status(200).json(buildResponse(role, candidate, fit));

  } catch (err) {
    console.error('classify error:', err);
    return res.status(200).json({ error: true, message: err.message });
  }
}

async function extractRole(client, jdText) {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Extract structured information from this job description.

Return ONLY valid JSON in this exact format:
{
  "title": "job title",
  "skills": ["skill1", "skill2"],
  "responsibilities": ["responsibility1", "responsibility2"],
  "expectations": ["expectation1", "expectation2"],
  "context": {
    "industry": "industry name",
    "company_size": "startup|mid-size|enterprise|unknown",
    "team_structure": "agile|waterfall|unknown"
  }
}

Skills = tools and technologies explicitly mentioned.
Responsibilities = what the person will actually do day to day.
Expectations = implied behaviours and traits (ownership, autonomy, communication style, seniority signals).
Extract 3-8 items per array. Return ONLY JSON, no explanation.

JOB DESCRIPTION:
${jdText}`
    }]
  });

  const text = msg.content[0].text;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return JSON.parse(text.slice(start, end + 1));
}

async function extractCandidate(client, cvText) {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Extract structured information from this CV.

Return ONLY valid JSON in this exact format:
{
  "skills": ["skill1", "skill2"],
  "experience": [
    {
      "title": "job title",
      "duration_months": 12,
      "domain": "industry or domain",
      "responsibilities": ["did this", "did that"]
    }
  ],
  "capabilities": ["capability1", "capability2"]
}

Skills = tools and technologies explicitly mentioned.
Experience = each role held, with duration and domain.
Capabilities = what this person can actually do based on their history.
Extract 3-8 items per array. Return ONLY JSON, no explanation.

CV:
${cvText}`
    }]
  });

  const text = msg.content[0].text;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return JSON.parse(text.slice(start, end + 1));
}

async function evaluateFit(client, role, candidate, goals) {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are a senior recruiter giving honest, direct feedback.

Role requires:
Skills: ${JSON.stringify(role.skills)}
Responsibilities: ${JSON.stringify(role.responsibilities)}
Expectations: ${JSON.stringify(role.expectations)}

Candidate has:
Skills: ${JSON.stringify(candidate.skills)}
Capabilities: ${JSON.stringify(candidate.capabilities)}

Return ONLY valid JSON in this exact format:
{
  "capability_fit": {
    "verdict": "strong|moderate|weak",
    "summary": "one sentence honest assessment",
    "matched": ["thing1", "thing2"],
    "gaps": ["gap1", "gap2"]
  },
  "goal_fit": null,
  "practical_fit": null,
  "screening_priorities": ["what recruiter will look for first", "second priority"],
  "risk": "specific interview questions or probing areas the interviewer will push on — e.g. 'Expect to be asked to walk through a SQL query live' or 'They will probe your experience owning a dashboard end-to-end'. This is about interview preparation, not job requirements.",
  "hidden_expectations": ["unstated assumption the employer has that is NOT written in the job description — e.g. 'Candidate is expected to work autonomously with no handholding from day one' or 'The team assumes prior experience in a fast-growth startup'. These are employer mindset assumptions, not interview questions."],
  "career_impact": {
    "strengthens": ["specific skill 1", "specific skill 2"],
    "limited_exposure": ["area 1", "area 2"]
  }
}

Rules:
- risk = what the interviewer will probe or test. Specific questions or scenarios the candidate should prepare for. Not requirements — preparation intel.
- hidden_expectations = unstated assumptions the employer holds about the ideal candidate that are not written anywhere in the job description. Not interview questions.
- risk and hidden_expectations must not overlap. They cover different things.
- career_impact.strengthens = specific skills, capabilities or experiences the candidate will build by doing this role. Must be concrete and career-relevant — e.g. "Agile delivery ownership", "Functional specification writing", "Client-facing requirement discovery". Never include personality traits or soft skills such as "Strong communication", "Attention to detail", or "Logical thinking".
- career_impact.limited_exposure = specific career areas or disciplines this role does NOT develop, relevant to data, business or product careers — e.g. "Product strategy", "Data science", "Commercial ownership", "Advanced analytics". Never use generic phrases.
- Be specific. Name actual skills and responsibilities. Do not be generic.
Return ONLY JSON.`
    }]
  });

  const text = msg.content[0].text;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return JSON.parse(text.slice(start, end + 1));
}
