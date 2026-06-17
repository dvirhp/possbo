import passport from "passport";
import FacebookStrategy from "passport-facebook";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

passport.use(
  new FacebookStrategy.Strategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: "http://localhost:5001/api/auth/facebook/callback",
      profileFields: [
        "id",
        "displayName",
        "email",
        "picture.width(200).height(200)",
      ],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await prisma.user.upsert({
          where: { facebookId: profile.id },
          update: {
            facebookAccessToken: accessToken,
            name: profile.displayName,
            email: profile.emails?.[0]?.value,
            profileImage: profile.photos?.[0]?.value,
          },
          create: {
            facebookId: profile.id,
            facebookAccessToken: accessToken,
            name: profile.displayName,
            email: profile.emails?.[0]?.value,
            profileImage: profile.photos?.[0]?.value,
          },
        });
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;
