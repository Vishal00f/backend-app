import { User } from "../models/user.models.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import validator from "validator"
import { uploadToCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"
const generateAccessAndRefreshTokens = async (userid) => {
    try {
        const user = await User.findById(userid);
        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();
        //save refresh token in db as well 
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });
        return { refreshToken, accessToken };

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access and refresh token")
    }
}


const registerUser = asyncHandler(async (req, res) => {
    //get user details from frontend 
    //validation 
    //check if user already exists with username/email 
    //check for images, check for avatar
    //upload to cloudinary, avatar,
    // create user object- create entry in db 
    // renove password and refresh token field from response
    // check for user creation and return response

    const { username, email, fullname, password } = req.body
    //validations
    if (
        [username, email, password, fullname].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required");
    }
    if (!validator.isEmail(email)) {
        throw new ApiError(400, "Email is invalid")
    }
    //check if user exists
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }
    //check for avatar, we can take here req.files because multer does this for us it allows us to use req.files because we added a middleware
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }
    //images are checked now upload them to cloudinary
    const avatar = await uploadToCloudinary(avatarLocalPath);
    const coverImage = await uploadToCloudinary(coverImageLocalPath)
    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }

    //now create user entry in user model or db 
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })
    //check if user is created or not
    //now we dont have to send password or refresh token in response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while register")
    }
    return res.status(201).json(
        new ApiResponse(200, createdUser, "user created successfully")
    )
})

const loginUser = asyncHandler(async (req, res) => {
    //get user details from frontend
    //check if email/username is correct or not 
    //find the user
    //password check 
    //generate access and refresh token 
    //send tokens in cookies 
    const { email, password, username } = req.body
    if (!username && !email) {
        throw new ApiError(400, "username or email is required")
    }
    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (!user) {
        throw new ApiError(404, "User does not exists");
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid) {
        throw new ApiError(401, "Incorrect Password")
    }
    const { refreshToken, accessToken } = await generateAccessAndRefreshTokens(user._id)
    //we also have to update the user because it doesnt had refresh token at that time
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    //cookies also require some options like if we add these options then the cookies will be only modifiable by server side only
    //it adds security front end cant change this
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, {
                user: loggedInUser, accessToken, refreshToken
            }, "User loggedin successfully")
        )
    //here we are also sharing refreshtoken and access token because for the scenarios like the user saves these tokens in local storage or etc 

})
const logoutUser = asyncHandler(async (req, res) => {
    //steps to logout user 
    // first create a middleware which will does this - 1->it will extract a accesstoken from the cookies through req.cookies.accessToken
    // then we have to verify that token through jwt.verify and extract a decoded token 
    // through that token we can extract user from the datababse throug token's id property 
    // now we will set req.user = user 
    // main thing we had to do is to extract the user through the access token saved in cookies
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options).json(
        new ApiResponse(200, {}, "User logged out")
    )
})

const refreshAccessToken = asyncHandler(async (req, res) => {


    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized access")
    }
    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);

        const user = await User.findById(decodedToken?._id)
        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "refresh token is expired or used")
        }

        const { accessToken, newRefreshToken } = generateAccessAndRefreshTokens(user._id)
        const options = {
            httpOnly: true,
            secure: true
        }

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(200, { accessToken, refreshToken: newRefreshToken }, "Access Token refreshed")
            )

    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError("Invalid old password");
    }
    user.password = newPassword;
    user.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"))


})
const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(200, req.user, "Current user fetched successfully")
})
const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullname } = req.body
    if (!fullname) {
        throw new ApiError(400, "Full name is empty");
    }
    const user = await User.findByIdAndUpdate(req.user._id,
        {
            set: {
                fullname
            }
        },
        {
            new: true
        }
    ).select("-password")
    return res.status(200).json(new ApiResponse(200, user, "Account details updated successfully"))
})
const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }
    const avatar = await uploadToCloudinary(avatarLocalPath)
    if (!avatar.url) {
        throw new ApiError(400, "Error while updating avatar")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {
            new: true
        }
    ).select("-password -refreshToken")
    return res.status(200).json(
        new ApiResponse(200,user,"Avatar image updated successfully")
    )
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path
    if (!coverImageLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }
    const coverImage = await uploadToCloudinary(coverImageLocalPath)
    if (!coverImage.url) {
        throw new ApiError(400, "Error while updating avatar")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {
            new: true
        }
    ).select("-password -refreshToken")
    return res.status(200).json(
        new ApiResponse(200,user,"cover image updated successfully")
    )
})

const getUserChannelProfile = asyncHandler(async (req,res)=>{
    const {username}= req.params
    if(!username?.trim()){
        throw new ApiError(400,"Username is missing ");
    }
    
    const channel = await User.aggregate([
        {
            $match:{
                username:username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        }
        ,
        {
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                subscribedToCount:{
                    $size:"$subscribedTo"
                }
                //here we added $ signs because we will treat it as fields
                ,
                isSubscribed:{
                    $cond:{
                      if:{$in:[req.user?._id,"$subscribers.subscriber"]},
                      then:true,
                      else:false 
                    }
                }
            }
        },
        {
            $project:{
                fullname:1,
                username:1,
                subscribersCount:1,
                subscribedToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
            }
        }
    ])

    if(!channel?.length){
        throw new ApiError(400,"channel not found");
    }
    return res.status(200)
    .json(
      new ApiResponse(200,channel[0],"Channel details fetched successfully")
    )

})
const getWatchHistory = asyncHandler(async (req,res)=>{
    const user = await User.aggregate([
        {
            $match:{
                _id:new mongoose.Types.ObjectId.createFromHexString(req.user._id)
            }
            
        },
        {
            $lookup:{
                from:"videos",
                localField:"watchHistory",
                foreignField:"_id",
                as:"watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullname:1,
                                        username:1,
                                        avatar:1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])
    return res
    .status(200)
    .json(
        new ApiResponse(200,user[0].watchHistory,"watch history fetched successfully")
    )
})

export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage,getUserChannelProfile,getWatchHistory}

/*
refresh access token steps 
1->extract refresh token from cookies
2->check if token is valid
3->verify the incoming refresh token through jwt.verify
4->extract decodedtoken through incoming token through verify 
5->find user by the decodedtoken's _id property 
6->now check the refresh token stored in the user's db and the incoming refresh token 
7->if both the tokens are same generate access token and refresh tokens again
8->add accesstokens and newrefreshtokens in cookies through req.cookie() with options
9->return the res and in json return the access and refresh token 
*/