import { test, type Page } from '@playwright/test'
import * as setCookieParser from 'set-cookie-parser'
import { sessionKey } from '~/utils/auth.server.ts'
import { prisma } from '~/utils/db.server.ts'
import { sessionStorage } from '~/utils/session.server.ts'
import { insertedUsers, insertNewUser } from './db-utils.ts'

export async function loginPage({
	page,
	user: givenUser,
}: {
	page: Page
	user?: { id: string }
}) {
	const user = givenUser
		? await prisma.user.findUniqueOrThrow({
				where: { id: givenUser.id },
				select: {
					id: true,
					email: true,
					username: true,
					name: true,
				},
		  })
		: await insertNewUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
			userId: user.id,
		},
		select: { id: true },
	})

	const cookieSession = await sessionStorage.getSession()
	cookieSession.set(sessionKey, session.id)
	const { value: cookieValue } = setCookieParser.parseString(
		await sessionStorage.commitSession(cookieSession),
	)
	await page.context().addCookies([
		{
			name: 'en_session',
			sameSite: 'Lax',
			domain: 'localhost',
			path: '/',
			httpOnly: true,
			value: cookieValue,
		},
	])
	return user as typeof user & { name: string }
}

/**
 * This allows you to wait for something (like an email to be available).
 *
 * It calls the callback every 50ms until it returns a value (and does not throw
 * an error). After the timeout, it will throw the last error that was thrown or
 * throw the error message provided as a fallback
 */
export async function waitFor<ReturnValue>(
	cb: () => ReturnValue | Promise<ReturnValue>,
	{
		errorMessage,
		timeout = 5000,
	}: { errorMessage?: string; timeout?: number } = {},
) {
	const endTime = Date.now() + timeout
	let lastError: unknown = new Error(errorMessage)
	while (Date.now() < endTime) {
		try {
			const response = await cb()
			if (response) return response
		} catch (e: unknown) {
			lastError = e
		}
		await new Promise(r => setTimeout(r, 100))
	}
	throw lastError
}

test.afterEach(async () => {
	await prisma.user.deleteMany({
		where: { id: { in: Array.from(insertedUsers) } },
	})
	insertedUsers.clear()
})
