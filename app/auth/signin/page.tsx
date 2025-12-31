"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams, useRouter } from "next/navigation"
import { cn } from "@/app/lib/utils"
import { Button } from "@/app/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Loader2 } from "lucide-react"
import { LighthouseIcon } from "@/app/components/ui/lighthouse-icon"

function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || "/"
  const error = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState("")
  const [isCheckingInstance, setIsCheckingInstance] = useState(true)

  useEffect(() => {
    const checkInstance = async () => {
      try {
        const response = await fetch("/api/instance/status")
        const data = await response.json()

        if (!data.initialized) {
          router.replace("/setup")
          return
        }
      } catch (error) {
        console.error("Error checking instance status:", error)
      } finally {
        setIsCheckingInstance(false)
      }
    }

    checkInstance()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setFormError("")

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    })

    if (result?.error) {
      setFormError("Invalid email or password")
      setIsLoading(false)
    } else if (result?.url) {
      window.location.href = result.url
    }
  }

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case "OAuthAccountNotLinked":
        return "This email is already associated with another account."
      case "CredentialsSignin":
        return "Invalid email or password."
      default:
        return errorCode
          ? "An error occurred during sign in. Please try again."
          : null
    }
  }

  const displayError = formError || getErrorMessage(error)

  if (isCheckingInstance) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6">
              {displayError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {displayError}
                </div>
              )}
              <div className="grid gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    "Login"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SignInPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LighthouseIcon size={16} />
          </div>
          Prompt Clarity
        </a>
        <LoginForm />
      </div>
    </div>
  )
}