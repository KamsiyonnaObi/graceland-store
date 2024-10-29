"use server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";

import db from "@/db/db";
import { hashPassword, isValidPassword } from "@/lib/isValidPassword";

import { SignUp } from "@/app/(auth)/signup/page";
import { LogIn } from "@/app/(auth)/login/page";
import { isTokenValid } from "./token.actions";

export async function getCurrentUser() {
  const currentUser: any = await getServerSession();
  if (!currentUser) {
    return null;
  }

  const { email } = currentUser.user;

  const loggedInUserId = await getUserByEmail(email);

  return loggedInUserId;
}

export async function getUserByEmail(email: string) {
  try {
    const loggedInUserId = await db.user.findUnique({
      where: { email: email },
      select: { id: true },
    });

    if (!loggedInUserId) {
      return null;
    }

    return loggedInUserId;
  } catch (error) {
    console.error(`error finding user - ${email} -> ${error}`);
    return null;
  }
}

export async function getAllUsers() {
  try {
    const users = await db.user.findMany();

    if (!users) {
      return { message: "no user found" };
    }

    return users;
  } catch (error) {
    console.log(error);
  }
}

export async function newUser(signUpInfo: SignUp) {
  try {
    // check if user exists
    const existingUser: any = await db.user.findUnique({
      where: { email: signUpInfo.email },
    });
    if (existingUser) {
      return { status: 500, message: "unable to sign user up" };
    }
    // hash password
    const hashedPassword = await hashPassword(signUpInfo.password);

    // Create a new user with hashed password
    const newUser = await db.user.create({
      data: {
        firstName: signUpInfo.firstName,
        lastName: signUpInfo.lastName,
        email: signUpInfo.email,
        password: hashedPassword, // Store hashed password
      },
    });
    // sign token and return the created user
    jwt.sign(
      { userId: newUser.id },
      process.env.JWT_SECRET || "",
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      },
      (err, token) => {
        if (err) {
          return { status: 500, message: "unable to sign user up" };
        }
        if (token) {
          // store token in cookies
          cookies().set("token", token);
        }
      },
    );
    return { message: "Successfully logged in", status: 200 };
  } catch (error) {
    console.log(error);
  }
}

export async function signUserIn(signInData: LogIn) {
  // check if user exists
  const existingUser: any = await db.user.findUnique({
    where: { email: signInData.email },
  });

  // compare passwords
  const validPassword = await isValidPassword(
    signInData.password,
    existingUser.password,
  );

  if (!validPassword || !existingUser) {
    return { status: 500, message: "unable to log in" };
  }

  // sign user id with jwt
  jwt.sign(
    { userId: existingUser.id },
    process.env.JWT_SECRET || "",
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    },
    (err, token) => {
      if (err) {
        return { status: 500, message: "unable to log in" };
      }
      if (token) {
        // store token in cookies
        cookies().set("token", token);
      }
    },
  );
  return { status: 200 };
}

export async function signUserOut() {
  const oneDay = 24 * 60 * 60 * 1000;
  cookies().set("token", "", { expires: Date.now() - oneDay });
}

export async function verifyUserEmail(token: string) {
  try {
    const { userId } = await isTokenValid(token);

    if (!userId) {
      return { success: false, message: "user token invalid or expired" };
    }

    await db.user.update({
      where: { id: userId },
      data: { verifiedEmail: true },
    });

    return { success: true, message: "user email has been verified" };
  } catch (error) {
    console.error(`failed to verify email - ${error}`);
    return {
      success: false,
      message: "something went wrong, please try again later",
    };
  }
}

export async function getUserLatestOrders() {
  const currentUserId = await getCurrentUser();

  if (!currentUserId?.id) {
    return { status: 401, message: "Unauthorized" };
  }
  const userOrders = await db.user.findUnique({
    where: { id: currentUserId.id },
    select: {
      firstName: true,
      orders: {
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          updatedAt: true,
          totalPriceInCents: true,
          trxref: true,
          orderItems: {
            select: {
              product: { select: { name: true, imagePath: true } },
              quantity: true,
            },
          },
        },
      },
    },
  });

  return { status: 200, message: "success", userOrders };
}

export async function deleteUser(id: string) {
  const user = await db.user.delete({
    where: { id },
  });

  if (user == null) return notFound();

  return user;
}
