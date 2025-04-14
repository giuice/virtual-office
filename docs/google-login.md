

# Login with Google

Supabase Auth supports Sign in with Google for the web, native Android applications, and Chrome extensions.

---

## Prerequisites

- You must have a Google Cloud project. Visit the [Google Cloud Platform](https://console.cloud.google.com) to create a new project if needed.

---

## Configuration

To support Sign in with Google, you need to configure the Google provider for your Supabase project.

For web applications you can set up your sign-in button in two ways:

- **Using your own application code**
- **Using Google's pre-built sign-in or One Tap flows**

---

### Application Code Configuration

To use your own application code:

1. In the Google Cloud console, go to the [Consent Screen configuration page](https://console.cloud.google.com). This screen is shown to your users when they consent to signing in to your app.
2. Under **Authorized domains**, add your Supabase project's domain (in the form `<PROJECT_ID>.supabase.co`).
3. Configure the following non-sensitive scopes:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
4. Go to the [API Credentials page](https://console.cloud.google.com).
5. Click **Create credentials** and choose **OAuth Client ID**.
6. For **Application type**, select **Web application**.
7. Under **Authorized JavaScript origins**, add your site URL.
8. Under **Authorized redirect URLs**, enter the callback URL from the [Supabase dashboard](https://app.supabase.io).
9. After configuring your credentials, note your client ID and secret. Add these to the Google Auth Provider section of the Supabase Dashboard.

> In local development you can add the client ID and secret to your `config.toml` file.

---

### Google Pre-built Configuration

To use Google’s pre-built sign-in buttons:

1. In the Google Cloud console, visit the [Consent Screen configuration page](https://console.cloud.google.com) and adjust the settings (including links to your privacy policy and terms of service).
2. Go to the [API Credentials page](https://console.cloud.google.com).
3. Click **Create credentials** and choose **OAuth Client ID**.
4. For **Application type**, select **Web application**.
5. Under **Authorized JavaScript origins** and **Authorized redirect URLs**, add your site URL. *(If testing on localhost, ensure you include `http://localhost` in the allowed origins.)*
6. Once configured, you will be shown your client ID. Enter this into the Client IDs field in the Google Auth Provider section of the Supabase Dashboard. (Leave the OAuth client ID and secret blank when using Google’s pre-built approach.)

---

## Signing Users In

### Using Your Own Application Code

To use your own button, call the `signInWithOAuth` method. Make sure you use the correct `supabase` client instance. For example, if you aren’t using Server-Side Rendering or cookie-based auth:

```javascript
supabase.auth.signInWithOAuth({ provider: 'google' })
```

For an **implicit flow**, that is all you need. The user is redirected to Google’s consent screen and then back to your app with access and refresh tokens.

For a **PKCE flow** (for example, with Server-Side Auth), provide a `redirectTo` URL pointing to your callback endpoint. This URL must be added to your [redirect allow list](https://app.supabase.io).

```javascript
await supabase.auth.signInWithOAuth({
  provider,
  options: {
    redirectTo: `http://example.com/auth/callback`,
  },
})
```

At the callback endpoint, you will handle the code exchange to save the user session.

#### Example: Next.js Callback Route (`app/auth/callback/route.ts`)

```typescript
import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // If "next" is provided in the parameters, use it as the redirect URL
  const next = searchParams.get('next') ?? '/'
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // No load balancer; no need to check for x-forwarded-host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }
  // Return the user to an error page with instructions if the code is invalid
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
```

---

## Saving Google Tokens

The tokens saved by your application are the Supabase Auth tokens. You might also need the Google OAuth 2.0 tokens to access Google services on behalf of the user.

On initial login, you can extract the `provider_token` from the session. Note that Google does not send a refresh token by default. To obtain the `provider_refresh_token`, pass the following parameters to `signInWithOAuth()`:

```javascript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
})
```

---

## Google Pre-built Sign-In

Many web apps can use Google’s pre-built solutions like personalized sign-in buttons, [One Tap](https://developers.google.com), or [automatic sign-in](https://developers.google.com) for an improved user experience.

1. **Load the Google Client Library**  
   Include the following script in your HTML:
   ```html
   <script src="https://accounts.google.com/gsi/client" async></script>
   ```
2. **Customize the Button**  
   Use the [HTML Code Generator](https://developers.google.com) to tailor the button’s look, feel, and behavior.
3. **Configure Callback**  
   Choose the JavaScript callback option and specify the name of your callback function which receives a [CredentialResponse](https://developers.google.com) upon sign-in.
4. **FedCM Compatibility**  
   To support Chrome’s third-party cookie phase-out, set `data-use_fedcm_for_prompt` to `true`.

Example HTML:

```html
<div
  id="g_id_onload"
  data-client_id="<client ID>"
  data-context="signin"
  data-ux_mode="popup"
  data-callback="handleSignInWithGoogle"
  data-nonce=""
  data-auto_select="true"
  data-itp_support="true"
  data-use_fedcm_for_prompt="true"
></div>
<div
  class="g_id_signin"
  data-type="standard"
  data-shape="pill"
  data-theme="outline"
  data-text="signin_with"
  data-size="large"
  data-logo_alignment="left"
></div>
```

Define the callback function (available in the global scope):

```javascript
async function handleSignInWithGoogle(response) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.credential,
  })
}
```

For improved security, you can configure a nonce as follows:

```javascript
async function handleSignInWithGoogle(response) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.credential,
    nonce: '<NONCE>',
  })
}
```

Because Supabase Auth expects the provider to hash the nonce (using SHA-256 in hexadecimal), provide a hashed version to Google and the plain version to `signInWithIdToken`. For example:

```javascript
// Adapted from MDN: Converting a digest to a hex string
const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
const encoder = new TextEncoder()
const encodedNonce = encoder.encode(nonce)
crypto.subtle.digest('SHA-256', encodedNonce).then((hashBuffer) => {
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  // Use 'hashedNonce' for the authentication request to Google
  // Use 'nonce' with supabase.auth.signInWithIdToken()
})
```

---

## One-tap with Next.js

If you are integrating Google One-Tap into your Next.js application, consider the following example:

```javascript
'use client'

import Script from 'next/script'
import { createClient } from '@/utils/supabase/client'
import { CredentialResponse } from 'google-one-tap'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const OneTapComponent = () => {
  const supabase = createClient()
  const router = useRouter()

  // Generate nonce to use for Google ID token sign-in
  const generateNonce = async (): Promise<string[]> => {
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    const encoder = new TextEncoder()
    const encodedNonce = encoder.encode(nonce)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    return [nonce, hashedNonce]
  }

  useEffect(() => {
    const initializeGoogleOneTap = () => {
      console.log('Initializing Google One Tap')
      window.addEventListener('load', async () => {
        const [nonce, hashedNonce] = await generateNonce()
        console.log('Nonce: ', nonce, hashedNonce)
        // Check for an existing session before initializing the One Tap UI
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.error('Error getting session', error)
        }
        if (data.session) {
          router.push('/')
          return
        }
        /* global google */
        google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: async (response: CredentialResponse) => {
            try {
              // Send the ID token from response.credential to Supabase
              const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential,
                nonce,
              })
              if (error) throw error
              console.log('Session data: ', data)
              console.log('Successfully logged in with Google One Tap')
              router.push('/')
            } catch (error) {
              console.error('Error logging in with Google One Tap', error)
            }
          },
          nonce: hashedNonce,
          // Use FedCM for Chrome’s third-party cookies removal
          use_fedcm_for_prompt: true,
        })
        google.accounts.id.prompt() // Display the One Tap UI
      })
    }
    initializeGoogleOneTap()
    return () => window.removeEventListener('load', initializeGoogleOneTap)
  }, [])

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" />
      <div id="oneTap" className="fixed top-0 right-0 z-[100]" />
    </>
  )
}

export default OneTapComponent
```

---

## Google Consent Screen

By default, the Google consent screen shows the root domain of the callback URL (i.e. `https://<your-project-ref>.supabase.co`).

If desired, you can configure a [Custom Domain](https://app.supabase.io) for your Supabase project. This custom domain will then be displayed in the consent screen. To have your app name and logo appear, [you must submit your app to Google for verification](https://support.google.com).

---
